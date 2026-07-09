"use client";

import { useTransition } from "react";
import { acknowledgeGate } from "@/lib/server/actions";
import { Button, Input } from "./ui";

export function AckGateForm({
  engagementId,
  gateKey,
  label,
}: {
  engagementId: string;
  gateKey: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form action={(fd) => startTransition(() => acknowledgeGate(fd))} className="space-y-2">
      <p className="text-xs text-muted">{label}</p>
      <div className="flex items-center gap-2">
        <input type="hidden" name="engagement_id" value={engagementId} />
        <input type="hidden" name="gate_key" value={gateKey} />
        <Input name="note" required placeholder="Explanation (required — appears in the report)" />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "…" : "Acknowledge"}
        </Button>
      </div>
    </form>
  );
}
