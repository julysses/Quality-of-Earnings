import { loadAnalysis } from "@/lib/server/load";
import { Uploader } from "@/components/uploader";
import { ConfirmDocForm } from "@/components/confirm-doc";
import { Badge, Callout, Card, Table, Td, Th } from "@/components/ui";
import { DOC_TYPE_LABELS, type DocType } from "@/lib/types";

// Upload-complete actions parse statements inline.
export const maxDuration = 60;

const DOC_ICONS: Partial<Record<DocType, string>> = {
  bank_statement: "🏦",
  pnl: "📈",
  balance_sheet: "⚖️",
  tax_return: "🧾",
  ar_aging: "📥",
  ap_aging: "📤",
  payroll: "👥",
  other: "📄",
  unclassified: "❓",
};

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bundle, analysis } = await loadAnalysis(id);
  const { completeness } = analysis;

  const countByType = (t: DocType) =>
    bundle.documents.filter((d) => d.doc_type === t && (d.status === "parsed" || d.status === "confirmed")).length;
  const checklist: Array<{ label: string; found: number; want: string; ok: boolean }> = [
    {
      label: "Bank statements",
      found: countByType("bank_statement"),
      want: "every account, every month",
      ok: bundle.transactions.length > 0,
    },
    {
      label: "Monthly P&L",
      found: countByType("pnl"),
      want: "one CSV covering the period",
      ok: bundle.facts.length > 0,
    },
    {
      label: "Tax returns",
      found: countByType("tax_return"),
      want: "each year (evidence)",
      ok: countByType("tax_return") > 0,
    },
  ];

  const needsReview = bundle.documents.filter((d) => d.status === "needs_review");
  const unsupported = bundle.documents.filter((d) => d.status === "unsupported");
  const hasCompletenessIssue =
    bundle.transactions.length > 0 &&
    (completeness.breaks.length > 0 || completeness.missingMonths.length > 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Uploader orgId={bundle.engagement.org_id} engagementId={id} />
        </div>
        <Card
          title="What to upload"
          subtitle="The report gets stronger with each one — the app tracks what's still missing."
        >
          <ul className="space-y-3">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">{item.label}</p>
                  <p className="text-xs text-muted">{item.want}</p>
                </div>
                <Badge tone={item.ok ? "green" : "gray"}>
                  {item.found > 0 ? `${item.found} file(s)` : "none yet"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div id="verify" className="space-y-4">
        {unsupported.map((d) => (
          <Callout key={d.id} tone="warn" title={`"${d.file_name}" needs a different format`}>
            <div className="space-y-1 whitespace-pre-line">{d.parse_error}</div>
          </Callout>
        ))}

        {needsReview.length > 0 && (
          <Callout tone="warn" title={`${needsReview.length} document(s) need a quick confirmation`}>
            We weren&apos;t sure what these files are. Pick the type below and they&apos;ll be
            processed immediately.
          </Callout>
        )}

        {hasCompletenessIssue && (
          <Callout tone="warn" title="Completeness check found gaps">
            {completeness.missingMonths.length > 0 && (
              <p>
                No bank activity for <strong>{completeness.missingMonths.join(", ")}</strong> —
                statements for those months are probably missing.
              </p>
            )}
            {completeness.breaks.length > 0 && (
              <p>
                {completeness.breaks.length} running-balance break(s) — rows or statements are
                missing (first gap: {completeness.breaks[0].date},{" "}
                {completeness.breaks[0].description}).
              </p>
            )}
          </Callout>
        )}
        {!hasCompletenessIssue && bundle.transactions.length > 0 && (
          <Callout tone="success" title="Statements are complete">
            Running balances are continuous and every month in the period has bank activity —
            exactly what a lender checks first.
          </Callout>
        )}

        <Card
          title={`Documents (${bundle.documents.length})`}
          subtitle="Files are classified automatically; CSV bank statements and P&Ls parse straight into the ledger. PDFs are stored as evidence (PDF extraction ships in the next release)."
        >
          {bundle.documents.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
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
                    <Td className="max-w-56">
                      <span className="flex items-center gap-2">
                        <span aria-hidden>{DOC_ICONS[d.doc_type] ?? "📄"}</span>
                        <span className="truncate font-medium">{d.file_name}</span>
                      </span>
                    </Td>
                    <Td>
                      {d.status === "needs_review" ? (
                        <ConfirmDocForm documentId={d.id} currentType={d.doc_type} />
                      ) : (
                        <span className="flex items-center gap-1.5">
                          {DOC_TYPE_LABELS[d.doc_type]}
                          {d.classification_confidence != null &&
                            d.classification_source !== "user" && (
                              <span className="text-xs text-muted">
                                {Math.round(d.classification_confidence * 100)}%
                                {d.classification_source === "ai" ? " AI" : ""}
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
                      {d.status === "parsed" && (
                        <Badge tone="green" dot>
                          parsed
                        </Badge>
                      )}
                      {d.status === "confirmed" && <Badge tone="blue">stored</Badge>}
                      {d.status === "uploaded" && <Badge tone="gray">processing</Badge>}
                      {d.status === "needs_review" && <Badge tone="yellow">confirm type</Badge>}
                      {d.status === "failed" && (
                        <span title={d.parse_error ?? undefined}>
                          <Badge tone="red">failed</Badge>
                        </span>
                      )}
                      {d.status === "unsupported" && <Badge tone="yellow">needs different format</Badge>}
                      {d.status === "failed" && d.parse_error && (
                        <p className="mt-1 max-w-64 text-xs text-bad">{d.parse_error}</p>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
