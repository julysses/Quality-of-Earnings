"use client";

import { useTransition } from "react";
import { deleteAdjustment } from "@/lib/server/actions";
import { Button } from "./ui";

export function DeleteAdjustmentButton({
  engagementId,
  adjustmentId,
}: {
  engagementId: string;
  adjustmentId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form action={(fd) => startTransition(() => deleteAdjustment(fd))}>
      <input type="hidden" name="engagement_id" value={engagementId} />
      <input type="hidden" name="adjustment_id" value={adjustmentId} />
      <Button type="submit" variant="ghost" disabled={pending} aria-label="Delete adjustment">
        {pending ? "…" : "✕"}
      </Button>
    </form>
  );
}
