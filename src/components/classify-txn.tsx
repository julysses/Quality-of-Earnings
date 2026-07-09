"use client";

// Plain-English transaction classification: radio chips instead of accounting
// dropdowns — the operator answers "what is this?" in one tap.

import { useState, useTransition } from "react";
import { classifyTransaction } from "@/lib/server/actions";
import { Button, Input } from "./ui";
import { TXN_CLASS_LABELS, type TxnClass } from "@/lib/types";

const DEPOSIT_OPTIONS: TxnClass[] = [
  "business_revenue",
  "owner_contribution",
  "loan_proceeds",
  "transfer",
  "refund",
  "other",
];
const DISBURSEMENT_OPTIONS: TxnClass[] = [
  "business_expense",
  "owner_draw",
  "loan_payment",
  "transfer",
  "personal_expense",
  "other",
];

export function ClassifyTxnForm({
  engagementId,
  transactionId,
  isDeposit,
}: {
  engagementId: string;
  transactionId: string;
  isDeposit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<TxnClass | null>(null);
  const options = isDeposit ? DEPOSIT_OPTIONS : DISBURSEMENT_OPTIONS;

  return (
    <form
      action={(fd) => startTransition(() => classifyTransaction(fd))}
      className="space-y-2"
    >
      <input type="hidden" name="engagement_id" value={engagementId} />
      <input type="hidden" name="transaction_id" value={transactionId} />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What is this transaction?">
        {options.map((c) => (
          <label
            key={c}
            className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              selected === c
                ? "border-primary bg-primary text-on-primary"
                : "border-edge-strong bg-surface text-muted hover:border-primary/50 hover:text-ink"
            }`}
          >
            <input
              type="radio"
              name="class"
              value={c}
              required
              checked={selected === c}
              onChange={() => setSelected(c)}
              className="sr-only"
            />
            {TXN_CLASS_LABELS[c]}
          </label>
        ))}
      </div>
      {selected && (
        <div className="flex items-center gap-2">
          <Input name="note" placeholder="Optional note (goes in the audit trail)" className="max-w-72" />
          <Button type="submit" size="sm" loading={pending}>
            Save
          </Button>
        </div>
      )}
    </form>
  );
}
