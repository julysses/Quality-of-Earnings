// DSCR (Debt Service Coverage Ratio) engine — deterministic, integer cents.
//
// Amortization follows standard lending-model convention (see the LBO
// modeling skill from anthropics/financial-services): interest accrues on
// the BEGINNING balance each period (never ending/average — that would be
// circular), payment is the standard mortgage-style annuity, and the ending
// balance is floored at zero.

import type { Cents } from "../types";

export interface DebtTranche {
  name: string;
  principalCents: Cents;
  annualRateBps: number; // basis points, e.g. 950 = 9.50%
  termMonths: number;
  interestOnlyMonths?: number; // no principal paydown for the first N months
}

export interface AmortizationRow {
  month: number; // 1-indexed
  beginningBalanceCents: Cents;
  paymentCents: Cents;
  interestCents: Cents;
  principalCents: Cents;
  endingBalanceCents: Cents;
}

// Standard annuity payment: P * r / (1 - (1+r)^-n), r = monthly rate.
function monthlyPayment(principalCents: Cents, monthlyRate: number, remainingMonths: number): Cents {
  if (remainingMonths <= 0 || principalCents <= 0) return 0;
  if (monthlyRate === 0) return Math.round(principalCents / remainingMonths);
  const factor = Math.pow(1 + monthlyRate, remainingMonths);
  const payment = (principalCents * monthlyRate * factor) / (factor - 1);
  return Math.round(payment);
}

export function buildAmortizationSchedule(tranche: DebtTranche): AmortizationRow[] {
  const rows: AmortizationRow[] = [];
  if (tranche.principalCents <= 0 || tranche.termMonths <= 0) return rows;

  const monthlyRate = tranche.annualRateBps / 10000 / 12;
  const ioMonths = Math.min(tranche.interestOnlyMonths ?? 0, tranche.termMonths);
  let balance = tranche.principalCents;

  for (let m = 1; m <= tranche.termMonths; m++) {
    const beginning = balance;
    const interest = Math.round(beginning * monthlyRate);

    let principal: number;
    let payment: number;
    if (m <= ioMonths) {
      principal = 0;
      payment = interest;
    } else {
      const remainingAmortMonths = tranche.termMonths - ioMonths - (m - ioMonths - 1);
      payment = monthlyPayment(beginning, monthlyRate, remainingAmortMonths);
      principal = Math.max(0, Math.min(beginning, payment - interest));
      payment = interest + principal;
    }

    const ending = Math.max(0, beginning - principal);
    rows.push({
      month: m,
      beginningBalanceCents: beginning,
      paymentCents: payment,
      interestCents: interest,
      principalCents: principal,
      endingBalanceCents: ending,
    });
    balance = ending;
  }

  return rows;
}

// Total scheduled principal + interest across months 1-12 (first year of the
// note). A "lite" simplification: DSCR is evaluated against year-1 debt
// service, which is the binding constraint lenders actually underwrite to.
export function annualDebtServiceCents(schedule: AmortizationRow[]): Cents {
  return schedule.slice(0, 12).reduce((sum, r) => sum + r.paymentCents, 0);
}

export type DscrTierKey = "all_addbacks" | "documented_only" | "sde";

export interface DscrTierResult {
  tier: DscrTierKey;
  earningsCents: Cents;
  debtServiceCents: Cents;
  ratio: number | null; // null when debt service is zero (undefined ratio)
  meetsSbaFloor: boolean; // >= 1.15x
  meetsMarketThreshold: boolean; // >= 1.25x
}

export const SBA_FLOOR = 1.15;
export const MARKET_THRESHOLD = 1.25;

export function computeDscr(
  tranches: DebtTranche[],
  earnings: { allAddbacksCents: Cents; documentedOnlyCents: Cents; sdeCents: Cents },
): { tiers: DscrTierResult[]; totalAnnualDebtServiceCents: Cents; schedules: Record<string, AmortizationRow[]> } {
  const schedules: Record<string, AmortizationRow[]> = {};
  let totalDebtService = 0;
  for (const t of tranches) {
    const schedule = buildAmortizationSchedule(t);
    schedules[t.name] = schedule;
    totalDebtService += annualDebtServiceCents(schedule);
  }

  const tierEarnings: Record<DscrTierKey, Cents> = {
    all_addbacks: earnings.allAddbacksCents,
    documented_only: earnings.documentedOnlyCents,
    sde: earnings.sdeCents,
  };

  const tiers: DscrTierResult[] = (Object.keys(tierEarnings) as DscrTierKey[]).map((tier) => {
    const earningsCents = tierEarnings[tier];
    const ratio = totalDebtService > 0 ? earningsCents / totalDebtService : null;
    return {
      tier,
      earningsCents,
      debtServiceCents: totalDebtService,
      ratio,
      meetsSbaFloor: ratio != null && ratio >= SBA_FLOOR,
      meetsMarketThreshold: ratio != null && ratio >= MARKET_THRESHOLD,
    };
  });

  return { tiers, totalAnnualDebtServiceCents: totalDebtService, schedules };
}
