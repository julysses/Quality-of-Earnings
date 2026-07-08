"use client";

import { useTransition } from "react";
import { classifyTransaction } from "@/lib/server/actions";
import { Button, Input, Select } from "./ui";
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
  const options = isDeposit ? DEPOSIT_OPTIONS : DISBURSEMENT_OPTIONS;
  return (
    <form
      action={(fd) => startTransition(() => classifyTransaction(fd))}
      className="flex items-center gap-1.5"
    >
      <input type="hidden" name="engagement_id" value={engagementId} />
      <input type="hidden" name="transaction_id" value={transactionId} />
      <Select name="class" defaultValue={isDeposit ? "owner_contribution" : "business_expense"}>
        {options.map((c) => (
          <option key={c} value={c}>
            {TXN_CLASS_LABELS[c]}
          </option>
        ))}
      </Select>
      <Input name="note" placeholder="Note (optional)" className="w-36" />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "…" : "Save"}
      </Button>
    </form>
  );
}
