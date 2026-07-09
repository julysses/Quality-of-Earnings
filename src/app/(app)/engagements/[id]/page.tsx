import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadAnalysis } from "@/lib/server/load";
import { computeSteps } from "@/lib/steps";
import { Card, HelpTip, StatTile } from "@/components/ui";
import { formatCents, formatCentsShort } from "@/lib/money";

const ACTION_LABELS: Record<string, string> = {
  "engagement.created": "created this engagement",
  "engagement.demo_seeded": "loaded the demo data",
  "engagement.finalized": "finalized the report",
  "document.uploaded": "uploaded a document",
  "document.ingested": "parsed a document into the ledger",
  "document.type_confirmed": "confirmed a document type",
  "transaction.classified": "classified a bank transaction",
  "adjustment.created": "added an EBITDA adjustment",
  "adjustment.deleted": "removed an adjustment",
  "gate.acknowledged": "acknowledged an exception",
};

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bundle, analysis } = await loadAnalysis(id);
  const { poc, bridge } = analysis;
  const plan = computeSteps(bundle, analysis);

  const supabase = await createClient();
  const { data: activity } = await supabase
    .from("audit_events")
    .select("action,detail,created_at")
    .eq("engagement_id", id)
    .order("created_at", { ascending: false })
    .limit(6);

  const hasData = bundle.facts.length > 0;

  return (
    <div className="space-y-5">
      {hasData && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Revenue (period)"
            value={formatCentsShort(bridge.revenueCents)}
            sub="Per books"
          />
          <StatTile
            label="Reported EBITDA"
            value={formatCentsShort(bridge.ebitdaCents)}
            sub="Before adjustments"
          />
          <StatTile
            label="Adjusted EBITDA"
            value={formatCentsShort(bridge.adjustedEbitdaCents)}
            sub={`${bridge.adjustments.length} add-back(s)`}
            tone="primary"
          />
          <StatTile
            label="SDE"
            value={formatCentsShort(bridge.sdeCents)}
            sub="EBITDA + owner comp"
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <Card
          className="lg:col-span-3"
          title="Your path to a finalized report"
          subtitle="Work top to bottom — every step links to the right place."
        >
          <ol className="space-y-1">
            {plan.steps.map((step, i) => (
              <li key={step.key}>
                <Link
                  href={step.href}
                  className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-2"
                >
                  {step.state === "complete" ? (
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-good text-white">
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                        <path d="M13.78 4.22a.75.75 0 010 1.06l-6.5 6.5a.75.75 0 01-1.06 0l-3-3a.75.75 0 111.06-1.06l2.47 2.47 5.97-5.97a.75.75 0 011.06 0z" />
                      </svg>
                    </span>
                  ) : (
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        step.state === "attention"
                          ? "bg-warn text-white"
                          : step.state === "current"
                            ? "bg-primary text-on-primary"
                            : "border border-edge-strong text-muted"
                      }`}
                    >
                      {step.state === "attention" ? step.count : i + 1}
                    </span>
                  )}
                  <span>
                    <span
                      className={`block text-sm font-medium ${
                        step.state === "todo" ? "text-muted" : "text-ink"
                      }`}
                    >
                      {step.label}
                    </span>
                    <span className="block text-xs leading-relaxed text-muted">{step.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          {bundle.transactions.length > 0 && bundle.facts.length > 0 && (
            <Card
              title={
                <span className="inline-flex items-center gap-1.5">
                  Proof of cash by month
                  <HelpTip>
                    A green month means the revenue and expenses in the books match what actually
                    moved through the bank, within tolerance (the greater of $2,500 or 0.5% of that
                    month&apos;s revenue). Red months have unexplained differences to resolve.
                  </HelpTip>
                </span>
              }
            >
              <div className="grid grid-cols-6 gap-1.5">
                {poc.months.map((m) => {
                  const flagged = m.revenue.flagged || m.expense.flagged;
                  return (
                    <Link
                      key={m.month}
                      href={`/engagements/${id}/proof-of-cash#${m.month}`}
                      title={`${m.month}: revenue variance ${formatCents(m.revenue.varianceCents)}`}
                      className={`rounded-md px-1 py-2 text-center text-xs font-semibold ${
                        flagged ? "bg-bad-bg text-bad" : "bg-good-bg text-good"
                      }`}
                    >
                      {m.month.slice(5)}
                    </Link>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted">
                {poc.flaggedMonths.length === 0
                  ? "Every month ties to the bank."
                  : `${poc.flaggedMonths.length} month(s) need attention.`}
              </p>
            </Card>
          )}

          <Card title="Recent activity">
            {activity && activity.length > 0 ? (
              <ul className="space-y-2.5">
                {activity.map((a, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-sm">
                    <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-edge-strong" />
                    <span className="text-ink">
                      {ACTION_LABELS[a.action] ?? a.action}
                      <span className="ml-1.5 text-xs text-muted">
                        {new Date(a.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
