"use client";

import { useTransition } from "react";
import { confirmDocument } from "@/lib/server/actions";
import { Button, Select } from "./ui";
import { DOC_TYPE_LABELS, type DocType } from "@/lib/types";

export function ConfirmDocForm({
  documentId,
  currentType,
}: {
  documentId: string;
  currentType: DocType;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => startTransition(() => confirmDocument(fd))}
      className="flex items-center gap-1.5"
    >
      <input type="hidden" name="document_id" value={documentId} />
      <Select name="doc_type" defaultValue={currentType === "unclassified" ? "bank_statement" : currentType}>
        {Object.entries(DOC_TYPE_LABELS)
          .filter(([k]) => k !== "unclassified")
          .map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
      </Select>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "…" : "Confirm"}
      </Button>
    </form>
  );
}
