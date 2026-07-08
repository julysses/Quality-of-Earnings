// Proof of cash v0: reconciles book revenue/expenses (financial facts) to bank
// deposits/disbursements month by month. Deterministic; every number traces to
// transaction ids. v0 assumes cash-basis books (timing/AR-DR adjustments are a
// later slice) and discloses that limitation in the report.

import {
  BankTxn,
  Cents,
  Fact,
  TxnClass,
  CATEGORY_GROUPS,
  NON_EXPENSE_DISBURSEMENT_CLASSES,
  NON_REVENUE_DEPOSIT_CLASSES,
  monthOf,
  monthsBetween,
} from "../types";

export interface PoCOptions {
  periodStart: string; // YYYY-MM
  periodEnd: string; // YYYY-MM
  fixedThresholdCents?: Cents; // default $2,500
  pctOfRevenue?: number; // default 0.5%
}

export interface PoCSide {
  bankTotalCents: Cents; // gross deposits or |disbursements|
  excludedCents: Cents; // classified as non-operating (transfers, draws, ...)
  adjustedBankCents: Cents;
  bookCents: Cents;
  varianceCents: Cents; // adjustedBank - book
  flagged: boolean;
  excludedTxnIds: string[];
}

export interface PoCMonth {
  month: string;
  revenue: PoCSide;
  expense: PoCSide;
  // Unclassified txns on the flagged side(s) — what the workbench asks about.
  openItemTxnIds: string[];
}

export interface ProofOfCash {
  months: PoCMonth[];
  flaggedMonths: string[];
  thresholdCents: Cents;
}

const BOOK_REVENUE_GROUPS = new Set(["revenue", "other_income"]);
// Cash operating expenses: everything except non-cash D&A.
const BOOK_CASH_EXPENSE_GROUPS = new Set([
  "cogs",
  "opex",
  "owner_comp",
  "interest",
  "taxes",
]);

export function computeProofOfCash(
  txns: BankTxn[],
  classifications: Map<string, TxnClass>,
  facts: Fact[],
  opts: PoCOptions,
): ProofOfCash {
  const fixed = opts.fixedThresholdCents ?? 2500_00;
  const pct = opts.pctOfRevenue ?? 0.005;

  const bookRevenue = new Map<string, Cents>();
  const bookExpense = new Map<string, Cents>();
  for (const f of facts) {
    const group = CATEGORY_GROUPS[f.categoryKey];
    if (!group) continue;
    if (BOOK_REVENUE_GROUPS.has(group)) {
      bookRevenue.set(f.month, (bookRevenue.get(f.month) ?? 0) + f.amountCents);
    } else if (BOOK_CASH_EXPENSE_GROUPS.has(group)) {
      bookExpense.set(f.month, (bookExpense.get(f.month) ?? 0) + f.amountCents);
    }
  }

  const byMonth = new Map<string, BankTxn[]>();
  for (const t of txns) {
    const m = monthOf(t.date);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(t);
  }

  const months: PoCMonth[] = [];
  const flaggedMonths: string[] = [];

  for (const month of monthsBetween(opts.periodStart, opts.periodEnd)) {
    const monthTxns = byMonth.get(month) ?? [];

    let deposits = 0;
    let depositsExcluded = 0;
    const depositExcludedIds: string[] = [];
    let disbursements = 0;
    let disbursementsExcluded = 0;
    const disbursementExcludedIds: string[] = [];
    const unclassifiedDeposits: string[] = [];
    const unclassifiedDisbursements: string[] = [];

    for (const t of monthTxns) {
      const cls = classifications.get(t.id);
      if (t.amountCents > 0) {
        deposits += t.amountCents;
        if (cls && NON_REVENUE_DEPOSIT_CLASSES.includes(cls)) {
          depositsExcluded += t.amountCents;
          depositExcludedIds.push(t.id);
        } else if (!cls) {
          unclassifiedDeposits.push(t.id);
        }
      } else if (t.amountCents < 0) {
        disbursements += -t.amountCents;
        if (cls && NON_EXPENSE_DISBURSEMENT_CLASSES.includes(cls)) {
          disbursementsExcluded += -t.amountCents;
          disbursementExcludedIds.push(t.id);
        } else if (!cls) {
          unclassifiedDisbursements.push(t.id);
        }
      }
    }

    const bookRev = bookRevenue.get(month) ?? 0;
    const bookExp = bookExpense.get(month) ?? 0;
    const threshold = Math.max(fixed, Math.round(bookRev * pct));

    const revenueSide = buildSide(
      deposits,
      depositsExcluded,
      bookRev,
      threshold,
      depositExcludedIds,
    );
    const expenseSide = buildSide(
      disbursements,
      disbursementsExcluded,
      bookExp,
      threshold,
      disbursementExcludedIds,
    );

    const openItems: string[] = [];
    if (revenueSide.flagged) openItems.push(...unclassifiedDeposits);
    if (expenseSide.flagged) openItems.push(...unclassifiedDisbursements);

    if (revenueSide.flagged || expenseSide.flagged) flaggedMonths.push(month);
    months.push({ month, revenue: revenueSide, expense: expenseSide, openItemTxnIds: openItems });
  }

  return { months, flaggedMonths, thresholdCents: fixed };
}

function buildSide(
  bankTotal: Cents,
  excluded: Cents,
  book: Cents,
  threshold: Cents,
  excludedTxnIds: string[],
): PoCSide {
  const adjusted = bankTotal - excluded;
  const variance = adjusted - book;
  return {
    bankTotalCents: bankTotal,
    excludedCents: excluded,
    adjustedBankCents: adjusted,
    bookCents: book,
    varianceCents: variance,
    flagged: Math.abs(variance) > threshold,
    excludedTxnIds,
  };
}
