import Link from "next/link";
import { loadAnalysis } from "@/lib/server/load";
import { Badge, Callout, Card, Table, Td, Th } from "@/components/ui";
import { formatCents, formatCentsShort } from "@/lib/money";
import { FinalizeButton } from "@/components/finalize";
import { ADJUSTMENT_CATEGORY_LABELS, DOC_TYPE_LABELS } from "@/lib/types";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bundle, analysis } = await loadAnalysis(id);
  const { bridge, poc, gates, gatesPassed, completeness } = analysis;
  const e = bundle.engagement;
  const finalized = e.status === "finalized";
  const openGates = gates.filter((g) => !g.passed && !g.acknowledged);

  return (
    <div className="space-y-4">
      {/* Validation gates */}
      <Card
        title="Validation gates"
        subtitle="The report can only be finalized when every gate passes or carries a disclosed acknowledgement — that discipline is what makes the output defensible."
        actions={
          finalized ? (
            <Badge tone="green">Finalized</Badge>
          ) : (
            <FinalizeButton engagementId={id} disabled={!gatesPassed} />
          )
        }
      >
        <ul className="space-y-2">
          {gates.map((g) => (
            <li key={g.key} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5">
                {g.passed ? (
                  <Badge tone="green">pass</Badge>
                ) : g.acknowledged ? (
                  <Badge tone="yellow">acknowledged</Badge>
                ) : (
                  <Badge tone="red">open</Badge>
                )}
              </span>
              <div>
                <p className="font-medium">{g.label}</p>
                <p className="text-xs text-slate-500">{g.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        {openGates.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Resolve open gates on the{" "}
            <Link href={`/engagements/${id}/documents`} className="underline">
              Documents
            </Link>{" "}
            and{" "}
            <Link href={`/engagements/${id}/proof-of-cash`} className="underline">
              Proof of Cash
            </Link>{" "}
            tabs.
          </p>
        )}
      </Card>

      {/* Report preview */}
      <article className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <header className="mb-8 border-b border-slate-200 pb-6 text-center dark:border-slate-700">
          <p className="text-xs uppercase tracking-widest text-slate-400">
            Quality of Earnings — Lite {finalized ? "" : "(DRAFT)"}
          </p>
          <h1 className="mt-2 text-2xl font-bold">{e.entity_name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Analysis period {e.period_start.slice(0, 7)} through {e.period_end.slice(0, 7)}
          </p>
        </header>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold">1. Notice to readers</h2>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            This report was prepared with QoE Lite from documents and data provided by the seller.
            It is not an audit, review, or attestation engagement under AICPA standards, and no
            opinion is expressed on the financial statements as a whole. Every figure in this
            report is computed deterministically from the underlying source documents and carries
            a traceable lineage; procedures performed, tolerances applied, and unresolved
            exceptions are disclosed below. Readers should perform their own diligence.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold">2. Executive summary</h2>
          <Table>
            <tbody>
              <tr>
                <Td>Revenue (per books, period)</Td>
                <Td align="right" className="font-medium">{formatCentsShort(bridge.revenueCents)}</Td>
              </tr>
              <tr>
                <Td>Reported net income</Td>
                <Td align="right">{formatCentsShort(bridge.netIncomeCents)}</Td>
              </tr>
              <tr>
                <Td>Reported EBITDA</Td>
                <Td align="right">{formatCentsShort(bridge.ebitdaCents)}</Td>
              </tr>
              <tr>
                <Td className="font-semibold">Adjusted EBITDA (all adjustments)</Td>
                <Td align="right" className="font-semibold">{formatCentsShort(bridge.adjustedEbitdaCents)}</Td>
              </tr>
              <tr>
                <Td>Adjusted EBITDA (documented adjustments only)</Td>
                <Td align="right">{formatCentsShort(bridge.adjustedEbitdaDocumentedCents)}</Td>
              </tr>
              <tr>
                <Td>Seller&apos;s discretionary earnings (SDE)</Td>
                <Td align="right">{formatCentsShort(bridge.sdeCents)}</Td>
              </tr>
              <tr>
                <Td>Proof of cash</Td>
                <Td align="right">
                  {poc.flaggedMonths.length === 0
                    ? "Ties within tolerance in all months"
                    : `${poc.months.length - poc.flaggedMonths.length} of ${poc.months.length} months tie; ${poc.flaggedMonths.length} disclosed exception(s)`}
                </Td>
              </tr>
            </tbody>
          </Table>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold">3. Quality of earnings — EBITDA bridge</h2>
          <Table>
            <tbody>
              <tr>
                <Td>Reported net income</Td>
                <Td align="right">{formatCents(bridge.netIncomeCents)}</Td>
              </tr>
              <tr>
                <Td>Depreciation &amp; amortization</Td>
                <Td align="right">{formatCents(bridge.daCents)}</Td>
              </tr>
              <tr>
                <Td>Interest expense</Td>
                <Td align="right">{formatCents(bridge.interestCents)}</Td>
              </tr>
              <tr>
                <Td>Income taxes</Td>
                <Td align="right">{formatCents(bridge.taxesCents)}</Td>
              </tr>
              <tr>
                <Td className="font-semibold">Reported EBITDA</Td>
                <Td align="right" className="font-semibold">{formatCents(bridge.ebitdaCents)}</Td>
              </tr>
            </tbody>
          </Table>
          {bridge.adjustments.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-sm font-semibold">Adjustments</h3>
              <Table>
                <thead>
                  <tr>
                    <Th>Adjustment</Th>
                    <Th>Category</Th>
                    <Th>Support</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {bridge.adjustments.map((a) => {
                    const row = bundle.adjustments.find((x) => x.id === a.id);
                    return (
                      <tr key={a.id}>
                        <Td>
                          <span className="font-medium">{a.name}</span>
                          {row && (
                            <p className="max-w-96 text-xs text-slate-500">{row.rationale}</p>
                          )}
                        </Td>
                        <Td>{ADJUSTMENT_CATEGORY_LABELS[a.category]}</Td>
                        <Td className="text-xs">
                          {a.scrutiny === "documented"
                            ? "Documented"
                            : a.scrutiny === "partially_supported"
                              ? "Partially supported"
                              : "Unsupported"}
                        </Td>
                        <Td align="right">{formatCents(a.amountCents)}</Td>
                      </tr>
                    );
                  })}
                  <tr>
                    <Td className="font-semibold">Adjusted EBITDA</Td>
                    <Td></Td>
                    <Td></Td>
                    <Td align="right" className="font-semibold">
                      {formatCents(bridge.adjustedEbitdaCents)}
                    </Td>
                  </tr>
                </tbody>
              </Table>
            </div>
          )}
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold">4. Proof of cash</h2>
          <p className="mb-2 text-xs text-slate-500">
            Book revenue and cash operating expenses reconciled to bank deposits and disbursements
            by month, across {bundle.accounts.length} account(s), with inter-account transfers and
            owner draws excluded. Tolerance: greater of $2,500 or 0.5% of monthly revenue.
            Timing differences (accrual vs. cash) are not yet adjusted in this lite analysis.
          </p>
          <Table>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th align="right">Adjusted deposits</Th>
                <Th align="right">Book revenue</Th>
                <Th align="right">Variance</Th>
                <Th align="right">Adjusted disbursements</Th>
                <Th align="right">Book cash expenses</Th>
                <Th align="right">Variance</Th>
              </tr>
            </thead>
            <tbody>
              {poc.months.map((m) => (
                <tr key={m.month}>
                  <Td>{m.month}</Td>
                  <Td align="right">{formatCents(m.revenue.adjustedBankCents)}</Td>
                  <Td align="right">{formatCents(m.revenue.bookCents)}</Td>
                  <Td align="right" className={m.revenue.flagged ? "font-semibold text-red-600" : ""}>
                    {formatCents(m.revenue.varianceCents)}
                  </Td>
                  <Td align="right">{formatCents(m.expense.adjustedBankCents)}</Td>
                  <Td align="right">{formatCents(m.expense.bookCents)}</Td>
                  <Td align="right" className={m.expense.flagged ? "font-semibold text-red-600" : ""}>
                    {formatCents(m.expense.varianceCents)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold">5. Disclosed exceptions</h2>
          {bundle.gateAcks.length === 0 &&
          completeness.breaks.length === 0 &&
          poc.flaggedMonths.length === 0 ? (
            <p className="text-sm text-slate-500">None.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
              {bundle.gateAcks.map((g) => (
                <li key={g.gate_key}>
                  <span className="font-medium">{g.gate_key}:</span> {g.note}
                </li>
              ))}
              {poc.flaggedMonths
                .filter((m) => !bundle.gateAcks.some((g) => g.gate_key === `poc:${m}`))
                .map((m) => (
                  <li key={m}>
                    <span className="font-medium">poc:{m}:</span> unresolved proof-of-cash variance
                    (open item — resolve before finalizing).
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">6. Source document index</h2>
          <Table>
            <thead>
              <tr>
                <Th>Document</Th>
                <Th>Type</Th>
                <Th>Period</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {bundle.documents.map((d) => (
                <tr key={d.id}>
                  <Td>{d.file_name}</Td>
                  <Td>{DOC_TYPE_LABELS[d.doc_type]}</Td>
                  <Td>
                    {d.period_start
                      ? `${d.period_start.slice(0, 7)} → ${d.period_end?.slice(0, 7) ?? "?"}`
                      : "—"}
                  </Td>
                  <Td>{d.status}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      </article>

      {!finalized && !gatesPassed && (
        <Callout tone="warn" title="This is a draft">
          Finalize is disabled until every validation gate passes or carries a disclosed
          acknowledgement.
        </Callout>
      )}
    </div>
  );
}
