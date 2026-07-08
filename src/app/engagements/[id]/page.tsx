import Link from "next/link";
import { loadAnalysis } from "@/lib/server/load";
import { Badge, Card, Table, Td } from "@/components/ui";
import { formatCentsShort } from "@/lib/money";

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bundle, analysis } = await loadAnalysis(id);
  const { poc, bridge, gates } = analysis;

  const steps: Array<{ label: string; done: boolean; href: string; hint: string }> = [
    {
      label: "Upload documents",
      done: bundle.documents.length > 0,
      href: `/engagements/${id}/documents`,
      hint: "Bank statements (CSV/OFX), monthly P&L (CSV), tax returns.",
    },
    {
      label: "Bank activity ingested",
      done: bundle.transactions.length > 0,
      href: `/engagements/${id}/documents`,
      hint: `${bundle.transactions.length.toLocaleString()} transactions in ${bundle.accounts.length} account(s).`,
    },
    {
      label: "P&L ingested",
      done: bundle.facts.length > 0,
      href: `/engagements/${id}/documents`,
      hint: bundle.facts.length > 0 ? "Monthly book figures loaded." : "Upload a monthly P&L CSV.",
    },
    {
      label: "Resolve proof-of-cash items",
      done: bundle.transactions.length > 0 && poc.flaggedMonths.every((m) =>
        gates.find((g) => g.key === `poc:${m}`)?.acknowledged,
      ) && bundle.facts.length > 0,
      href: `/engagements/${id}/proof-of-cash`,
      hint:
        poc.flaggedMonths.length > 0
          ? `${poc.flaggedMonths.length} month(s) need attention: ${poc.flaggedMonths.join(", ")}`
          : "All months tie within tolerance.",
    },
    {
      label: "Build the EBITDA bridge",
      done: bundle.adjustments.length > 0,
      href: `/engagements/${id}/ebitda-bridge`,
      hint: `${bundle.adjustments.length} adjustment(s) recorded.`,
    },
    {
      label: "Generate the report",
      done: bundle.engagement.status === "finalized",
      href: `/engagements/${id}/report`,
      hint: analysis.gatesPassed ? "All validation gates pass." : "Some validation gates are open.",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Engagement checklist" subtitle="Work top to bottom — each step links to the right tab.">
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className={
                  s.done
                    ? "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs text-white"
                    : "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs text-slate-400"
                }
              >
                {s.done ? "✓" : i + 1}
              </span>
              <div>
                <Link href={s.href} className="text-sm font-medium hover:underline">
                  {s.label}
                </Link>
                <p className="text-xs text-slate-500">{s.hint}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="space-y-4">
        <Card title="Headline numbers" subtitle="Live — every figure drills to source on its tab.">
          <Table>
            <tbody>
              <tr>
                <Td>Revenue (period, per books)</Td>
                <Td align="right">{formatCentsShort(bridge.revenueCents)}</Td>
              </tr>
              <tr>
                <Td>Reported EBITDA</Td>
                <Td align="right">{formatCentsShort(bridge.ebitdaCents)}</Td>
              </tr>
              <tr>
                <Td>Adjusted EBITDA (all add-backs)</Td>
                <Td align="right" className="font-semibold">
                  {formatCentsShort(bridge.adjustedEbitdaCents)}
                </Td>
              </tr>
              <tr>
                <Td>Adjusted EBITDA (documented only)</Td>
                <Td align="right">{formatCentsShort(bridge.adjustedEbitdaDocumentedCents)}</Td>
              </tr>
              <tr>
                <Td>Seller&apos;s discretionary earnings (SDE)</Td>
                <Td align="right">{formatCentsShort(bridge.sdeCents)}</Td>
              </tr>
            </tbody>
          </Table>
        </Card>

        <Card title="Proof of cash status">
          <div className="flex flex-wrap gap-1.5">
            {poc.months.map((m) => (
              <Link key={m.month} href={`/engagements/${id}/proof-of-cash#${m.month}`}>
                <Badge
                  tone={m.revenue.flagged || m.expense.flagged ? "red" : "green"}
                >
                  {m.month.slice(5)} {m.revenue.flagged || m.expense.flagged ? "✗" : "✓"}
                </Badge>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Green months tie to the bank within tolerance (greater of $2,500 or 0.5% of revenue).
          </p>
        </Card>
      </div>
    </div>
  );
}
