"use client";

import { useTransition } from "react";
import { finalizeEngagement } from "@/lib/server/actions";
import { Button } from "./ui";

export function FinalizeButton({
  engagementId,
  disabled,
}: {
  engagementId: string;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form action={(fd) => startTransition(() => finalizeEngagement(fd))}>
      <input type="hidden" name="engagement_id" value={engagementId} />
      <Button type="submit" disabled={disabled || pending}>
        {pending ? "Finalizing…" : "Finalize report"}
      </Button>
    </form>
  );
}
