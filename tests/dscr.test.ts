// Golden tests for the DSCR engine. Expected values computed independently
// in Python (standard amortization: interest on beginning balance, annuity
// payment, ending balance floored at zero) — see the plan notes; not derived
// from the engine itself.

import { describe, expect, it } from "vitest";
import {
  buildAmortizationSchedule,
  annualDebtServiceCents,
  computeDscr,
  SBA_FLOOR,
  MARKET_THRESHOLD,
  type DebtTranche,
} from "@/lib/engine/dscr";

describe("amortization schedule", () => {
  it("matches a hand-computed 10-year term loan (no IO)", () => {
    const tranche: DebtTranche = {
      name: "Senior debt",
      principalCents: 400_000_00,
      annualRateBps: 1000, // 10.00%
      termMonths: 120,
    };
    const schedule = buildAmortizationSchedule(tranche);
    expect(schedule).toHaveLength(120);
    expect(schedule[0].beginningBalanceCents).toBe(400_000_00);
    expect(schedule[0].paymentCents).toBe(5_286_03);
    expect(annualDebtServiceCents(schedule)).toBe(63_432_36);
    expect(schedule[11].endingBalanceCents).toBe(375_463_25);
    // Fully amortizes: final balance is zero.
    expect(schedule[119].endingBalanceCents).toBe(0);
  });

  it("matches a hand-computed note with a 12-month interest-only period", () => {
    const tranche: DebtTranche = {
      name: "Seller note",
      principalCents: 100_000_00,
      annualRateBps: 800, // 8.00%
      termMonths: 60,
      interestOnlyMonths: 12,
    };
    const schedule = buildAmortizationSchedule(tranche);
    expect(annualDebtServiceCents(schedule)).toBe(800_004);
    // Interest-only: no principal paydown in the first 12 months.
    expect(schedule[11].endingBalanceCents).toBe(100_000_00);
    expect(schedule.slice(0, 12).every((r) => r.principalCents === 0)).toBe(true);
    // Amortizes after month 12.
    expect(schedule[12].principalCents).toBeGreaterThan(0);
  });

  it("returns no rows for an empty tranche", () => {
    expect(buildAmortizationSchedule({ name: "none", principalCents: 0, annualRateBps: 500, termMonths: 120 })).toEqual([]);
    expect(buildAmortizationSchedule({ name: "none", principalCents: 1000, annualRateBps: 500, termMonths: 0 })).toEqual([]);
  });

  it("handles a zero-rate loan as straight-line principal", () => {
    const schedule = buildAmortizationSchedule({
      name: "0%",
      principalCents: 120_00,
      annualRateBps: 0,
      termMonths: 12,
    });
    expect(schedule[0].paymentCents).toBe(10_00);
    expect(schedule[0].interestCents).toBe(0);
    expect(schedule[11].endingBalanceCents).toBe(0);
  });
});

describe("DSCR computation", () => {
  const tranches: DebtTranche[] = [
    { name: "Senior debt", principalCents: 400_000_00, annualRateBps: 1000, termMonths: 120 },
    { name: "Seller note", principalCents: 100_000_00, annualRateBps: 800, termMonths: 60, interestOnlyMonths: 12 },
  ];
  // Total year-1 debt service: 6,343,236 + 800,004 = 7,143,240 cents = $71,432.40
  const totalDebtService = 63_432_36 + 800_004;

  it("sums debt service across tranches and computes ratios per tier", () => {
    // Debt service is $71,432.40. 1.15x = $82,147.26; 1.25x = $89,290.50.
    const result = computeDscr(tranches, {
      allAddbacksCents: 100_000_00, // $100,000 → clears market threshold
      documentedOnlyCents: 85_000_00, // $85,000 → clears SBA floor only
      sdeCents: 60_000_00, // $60,000 → fails SBA floor
    });

    expect(result.totalAnnualDebtServiceCents).toBe(totalDebtService);

    const all = result.tiers.find((t) => t.tier === "all_addbacks")!;
    expect(all.ratio).toBeCloseTo(100_000_00 / totalDebtService, 6);
    expect(all.ratio!).toBeGreaterThanOrEqual(MARKET_THRESHOLD);
    expect(all.meetsMarketThreshold).toBe(true);
    expect(all.meetsSbaFloor).toBe(true);

    const documented = result.tiers.find((t) => t.tier === "documented_only")!;
    expect(documented.meetsSbaFloor).toBe(true);
    expect(documented.meetsMarketThreshold).toBe(false);

    const sde = result.tiers.find((t) => t.tier === "sde")!;
    expect(sde.ratio!).toBeLessThan(SBA_FLOOR);
    expect(sde.meetsSbaFloor).toBe(false);
  });

  it("reports a null ratio when there is no debt", () => {
    const result = computeDscr([], { allAddbacksCents: 100_00, documentedOnlyCents: 100_00, sdeCents: 100_00 });
    expect(result.totalAnnualDebtServiceCents).toBe(0);
    expect(result.tiers.every((t) => t.ratio === null && !t.meetsSbaFloor)).toBe(true);
  });
});
