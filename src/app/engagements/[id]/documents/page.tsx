import { loadAnalysis } from "@/lib/server/load";
import { Uploader } from "@/components/uploader";
import { ConfirmDocForm } from "@/components/confirm-doc";
import { Badge, Callout, Card, Table, Td, Th } from "@/components/ui";
import { DOC_TYPE_LABELS } from "@/lib/types";

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bundle, analysis } = await loadAnalysis(id);
  const { completeness } = analysis;

  return (
    <div className="space-y-4">
      <Uploader orgId={bundle.engagement.org_id} engagementId={id} />

      {(completeness.breaks.length > 0 || completeness.missingMonths.length > 0) &&
        bundle.transactions.length > 0 && (
          <Callout tone="warn" title="Completeness check">
            {completeness.missingMonths.length > 0 && (
              <p>
                No bank activity found for: {completeness.missingMonths.join(", ")} — statements
                are probably missing.
              </p>
            )}
            {completeness.breaks.length > 0 && (
              <p>
                {completeness.breaks.length} running-balance break(s) detected — a statement or
                rows may be missing (first: {completeness.breaks[0].date},{" "}
                {completeness.breaks[0].description}).
              </p>
            )}
          </Callout>
        )}

      <Card
        title={`Documents (${bundle.documents.length})`}
        subtitle="Every file is classified automatically; anything uncertain asks for a one-click confirmation. CSV bank statements and P&Ls are parsed into the ledger immediately."
      >
        {bundle.documents.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Nothing uploaded yet — drop files above to get started.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Type</Th>
                <Th>Period</Th>
                <Th>Account</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {bundle.documents.map((d) => (
                <tr key={d.id}>
                  <Td className="max-w-56 truncate font-medium">{d.file_name}</Td>
                  <Td>
                    {d.status === "needs_review" ? (
                      <ConfirmDocForm documentId={d.id} currentType={d.doc_type} />
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {DOC_TYPE_LABELS[d.doc_type]}
                        {d.classification_confidence != null && d.classification_source !== "user" && (
                          <span className="text-xs text-slate-400">
                            {Math.round(d.classification_confidence * 100)}%
                            {d.classification_source === "ai" ? " (AI)" : ""}
                          </span>
                        )}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {d.period_start
                      ? `${d.period_start.slice(0, 7)} → ${d.period_end?.slice(0, 7) ?? "?"}`
                      : "—"}
                  </Td>
                  <Td>{d.account_hint ?? "—"}</Td>
                  <Td>
                    {d.status === "parsed" && <Badge tone="green">parsed</Badge>}
                    {d.status === "confirmed" && <Badge tone="blue">stored</Badge>}
                    {d.status === "uploaded" && <Badge tone="gray">uploaded</Badge>}
                    {d.status === "needs_review" && <Badge tone="yellow">confirm type</Badge>}
                    {d.status === "failed" && (
                      <span title={d.parse_error ?? undefined}>
                        <Badge tone="red">failed</Badge>
                      </span>
                    )}
                    {d.parse_error && (
                      <p className="mt-1 max-w-64 text-xs text-red-600">{d.parse_error}</p>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
