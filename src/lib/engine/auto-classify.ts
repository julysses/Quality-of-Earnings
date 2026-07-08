// Deterministic auto-classification.
//
// Rule 1 — transfer pairs: equal/opposite amounts in different accounts within
// 3 days are inter-account transfers (netted out of proof of cash).
// Rule 2 — description patterns on DISBURSEMENTS only (owner draws, loan
// payments). Deposits are never auto-classified as non-revenue: excluding a
// deposit reduces verified revenue, so that call always belongs to a human.

import { BankTxn, TxnClass } from "../types";

export interface AutoClassification {
  transactionId: string;
  cls: TxnClass;
  note: string;
}

const DAY_MS = 86_400_000;

export function detectTransferPairs(
  txns: BankTxn[],
  alreadyClassified: Set<string>,
): AutoClassification[] {
  const out: AutoClassification[] = [];
  const candidates = txns
    .filter((t) => !alreadyClassified.has(t.id))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Index outflows by absolute amount for pairing with inflows.
  const outflowsByAmount = new Map<number, BankTxn[]>();
  for (const t of candidates) {
    if (t.amountCents < 0) {
      const key = -t.amountCents;
      if (!outflowsByAmount.has(key)) outflowsByAmount.set(key, []);
      outflowsByAmount.get(key)!.push(t);
    }
  }

  const used = new Set<string>();
  for (const inflow of candidates) {
    if (inflow.amountCents <= 0) continue;
    const matches = outflowsByAmount.get(inflow.amountCents) ?? [];
    const match = matches.find(
      (o) =>
        !used.has(o.id) &&
        o.accountId !== inflow.accountId &&
        Math.abs(Date.parse(o.date) - Date.parse(inflow.date)) <= 3 * DAY_MS,
    );
    if (match) {
      used.add(match.id);
      used.add(inflow.id);
      const note = `Matched inter-account transfer: ${match.date} ↔ ${inflow.date}`;
      out.push({ transactionId: inflow.id, cls: "transfer", note });
      out.push({ transactionId: match.id, cls: "transfer", note });
    }
  }
  return out;
}

const DISBURSEMENT_PATTERNS: Array<{ re: RegExp; cls: TxnClass; note: string }> = [
  {
    re: /(owner.?draw|distribution to (member|owner|shareholder)|transfer to personal)/i,
    cls: "owner_draw",
    note: "Description indicates an owner draw/distribution",
  },
  {
    re: /(loan (principal|pmt|payment)|principal payment)/i,
    cls: "loan_payment",
    note: "Description indicates a loan principal payment",
  },
];

export function classifyByDescription(
  txns: BankTxn[],
  alreadyClassified: Set<string>,
): AutoClassification[] {
  const out: AutoClassification[] = [];
  for (const t of txns) {
    if (alreadyClassified.has(t.id) || t.amountCents >= 0) continue;
    for (const p of DISBURSEMENT_PATTERNS) {
      if (p.re.test(t.description)) {
        out.push({ transactionId: t.id, cls: p.cls, note: p.note });
        break;
      }
    }
  }
  return out;
}

export function autoClassify(
  txns: BankTxn[],
  alreadyClassified: Set<string>,
): AutoClassification[] {
  const transfers = detectTransferPairs(txns, alreadyClassified);
  const classified = new Set(alreadyClassified);
  for (const t of transfers) classified.add(t.transactionId);
  return [...transfers, ...classifyByDescription(txns, classified)];
}
