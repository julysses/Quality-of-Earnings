// Completeness checks: running-balance continuity within each account and
// month coverage across the engagement period.

import { BankTxn, Cents, monthOf, monthsBetween } from "../types";

export interface ContinuityBreak {
  accountId: string;
  date: string;
  description: string;
  expectedBalanceCents: Cents;
  actualBalanceCents: Cents;
}

export interface CompletenessResult {
  breaks: ContinuityBreak[];
  missingMonths: string[]; // months in period with zero bank transactions
}

export function checkCompleteness(
  txns: BankTxn[],
  periodStart: string,
  periodEnd: string,
): CompletenessResult {
  const byAccount = new Map<string, BankTxn[]>();
  for (const t of txns) {
    if (!byAccount.has(t.accountId)) byAccount.set(t.accountId, []);
    byAccount.get(t.accountId)!.push(t);
  }

  const breaks: ContinuityBreak[] = [];
  for (const [accountId, list] of byAccount) {
    const sorted = [...list].sort((a, b) =>
      a.date < b.date
        ? -1
        : a.date > b.date
          ? 1
          : (a.sourceLine ?? 0) - (b.sourceLine ?? 0),
    );
    let prevBalance: Cents | null = null;
    for (const t of sorted) {
      if (t.balanceCents == null) {
        prevBalance = null;
        continue;
      }
      if (prevBalance != null && prevBalance + t.amountCents !== t.balanceCents) {
        breaks.push({
          accountId,
          date: t.date,
          description: t.description,
          expectedBalanceCents: prevBalance + t.amountCents,
          actualBalanceCents: t.balanceCents,
        });
      }
      prevBalance = t.balanceCents;
    }
  }

  const covered = new Set(txns.map((t) => monthOf(t.date)));
  const missingMonths = monthsBetween(periodStart, periodEnd).filter(
    (m) => !covered.has(m),
  );

  return { breaks, missingMonths };
}
