"use client";

import { useMemo, useState, useTransition } from "react";
import { createAdjustment } from "@/lib/server/actions";
import { Button, Callout, Input, Label, Select, Textarea } from "./ui";
import { ADJUSTMENT_CATEGORY_LABELS } from "@/lib/types";

export function AddAdjustmentForm({
  engagementId,
  documents,
  transactions,
}: {
  engagementId: string;
  documents: Array<{ id: string; label: string }>;
  transactions: Array<{ id: string; label: string; description: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredTxns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return transactions.slice(0, 12);
    return transactions.filter((t) => t.description.toLowerCase().includes(q)).slice(0, 30);
  }, [search, transactions]);

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Add adjustment
      </Button>
    );
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null);
          try {
            await createAdjustment(fd);
            setOpen(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
          }
        })
      }
      className="space-y-3"
    >
      <input type="hidden" name="engagement_id" value={engagementId} />
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label htmlFor="adj-name">Name</Label>
          <Input id="adj-name" name="name" required placeholder="Owner's country club dues" />
        </div>
        <div>
          <Label htmlFor="adj-category">Category</Label>
          <Select id="adj-category" name="category" className="w-full">
            {Object.entries(ADJUSTMENT_CATEGORY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="adj-amount">Amount for the period ($, positive increases EBITDA)</Label>
          <Input id="adj-amount" name="amount" required placeholder="10,200" />
        </div>
      </div>
      <div>
        <Label htmlFor="adj-rationale">Rationale (appears in the report)</Label>
        <Textarea
          id="adj-rationale"
          name="rationale"
          required
          rows={2}
          placeholder="Why is this expense not part of ongoing operations? Who benefits from it? Will it continue post-close?"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Evidence — source documents</Label>
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-edge p-2 text-sm">
            {documents.length === 0 && <p className="text-xs text-muted">No documents uploaded yet.</p>}
            {documents.map((d) => (
              <label key={d.id} className="flex items-center gap-2">
                <input type="checkbox" name="evidence_document" value={d.id} />
                <span className="truncate">{d.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label>Evidence — bank transactions</Label>
          <Input
            placeholder="Search descriptions (e.g. BMW, Country Club)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-1"
          />
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-edge p-2 text-sm">
            {filteredTxns.map((t) => (
              <label key={t.id} className="flex items-center gap-2">
                <input type="checkbox" name="evidence_transaction" value={t.id} />
                <span className="truncate text-xs">{t.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted">
        At least one piece of evidence is required — adjustments without support can&apos;t be saved,
        because lenders will reject them anyway.
      </p>
      {error && <Callout tone="error">{error}</Callout>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save adjustment"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
