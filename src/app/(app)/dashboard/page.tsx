import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ensureOrg, seedDemoEngagement } from "@/lib/server/actions";
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import type { DocumentRow, EngagementRow } from "@/lib/db-types";

// Demo seeding pushes ~230 transactions through the real pipeline.
export const maxDuration = 60;

const HOW_IT_WORKS: Array<[string, string]> = [
  ["Upload", "Drop in bank statements and the monthly P&L — everything is classified automatically."],
  ["Resolve", "Answer plain-English questions until the bank ties to the books and add-backs carry evidence."],
  ["Report", "Finalize a lender-ready QoE report with a proof-of-cash appendix."],
];

// Cheap dashboard approximation from small tables only (documents,
// adjustments, status). The engagement page computes the precise plan.
function approximateProgress(
  e: EngagementRow,
  docs: Array<Pick<DocumentRow, "doc_type" | "status">>,
  adjustmentCount: number,
): { completed: number; label: string } {
  if (e.status === "finalized") return { completed: 5, label: "Finalized" };
  const parsedBank = docs.some((d) => d.doc_type === "bank_statement" && d.status === "parsed");
  const parsedPnl = docs.some((d) => d.doc_type === "pnl" && d.status === "parsed");
  const needsReview = docs.some((d) => d.status === "needs_review" || d.status === "failed");
  let completed = 0;
  if (parsedBank && parsedPnl) completed += needsReview ? 1 : 2;
  if (adjustmentCount > 0) completed += 1;
  const label =
    docs.length === 0 ? "Start by uploading documents" : completed === 0 ? "Documents processing" : "In progress";
  return { completed, label };
}

export default async function Dashboard() {
  const supabase = await createClient();
  await ensureOrg();

  const [{ data: engagements }, { data: docs }, { data: adjustments }] = await Promise.all([
    supabase
      .from("engagements")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<EngagementRow[]>(),
    supabase.from("documents").select("engagement_id,doc_type,status"),
    supabase.from("adjustments").select("engagement_id"),
  ]);

  const docsByEngagement = new Map<string, Array<Pick<DocumentRow, "doc_type" | "status">>>();
  for (const d of docs ?? []) {
    const key = d.engagement_id as string;
    if (!docsByEngagement.has(key)) docsByEngagement.set(key, []);
    docsByEngagement.get(key)!.push(d as Pick<DocumentRow, "doc_type" | "status">);
  }
  const adjCount = new Map<string, number>();
  for (const a of adjustments ?? []) {
    const key = a.engagement_id as string;
    adjCount.set(key, (adjCount.get(key) ?? 0) + 1);
  }

  const hasEngagements = (engagements?.length ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title="Engagements"
        description="One engagement per deal — upload the seller's documents, resolve the proof of cash, and generate a lender-ready report."
        actions={
          hasEngagements ? (
            <>
              <form action={seedDemoEngagement}>
                <Button variant="secondary" type="submit">
                  Load demo
                </Button>
              </form>
              <Link href="/engagements/new">
                <Button type="button">+ New engagement</Button>
              </Link>
            </>
          ) : undefined
        }
      />

      {hasEngagements ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {engagements!.map((e) => {
            const progress = approximateProgress(
              e,
              docsByEngagement.get(e.id) ?? [],
              adjCount.get(e.id) ?? 0,
            );
            return (
              <Link key={e.id} href={`/engagements/${e.id}`} className="group">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-ink group-hover:underline">
                        {e.name}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {e.entity_name} · {e.period_start.slice(0, 7)} → {e.period_end.slice(0, 7)}
                      </p>
                    </div>
                    {e.is_demo ? (
                      <Badge tone="blue">demo</Badge>
                    ) : (
                      <Badge tone={e.status === "finalized" ? "green" : "gray"} dot>
                        {e.status === "finalized" ? "Final" : "Active"}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-5">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted">{progress.label}</span>
                      <span className="font-medium text-muted">{progress.completed}/5 steps</span>
                    </div>
                    <ProgressBar value={progress.completed} max={5} />
                  </div>
                  <p className="mt-4 text-sm font-medium text-primary">Continue →</p>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          <Card padded={false}>
            <EmptyState
              icon={
                <svg viewBox="0 0 32 32" className="h-12 w-12" aria-hidden>
                  <rect width="32" height="32" rx="7" fill="var(--surface-2)" />
                  <rect x="6" y="17" width="4.5" height="9" rx="1.5" fill="var(--primary)" opacity="0.4" />
                  <rect x="13.75" y="12" width="4.5" height="14" rx="1.5" fill="var(--primary)" opacity="0.7" />
                  <rect x="21.5" y="6" width="4.5" height="20" rx="1.5" fill="var(--primary)" />
                </svg>
              }
              title="Run your first Quality of Earnings"
              body="See the whole process on a realistic demo company first, or jump straight into your own deal."
            >
              <form action={seedDemoEngagement}>
                <Button type="submit" size="lg">
                  Load the demo engagement
                </Button>
              </form>
              <Link href="/engagements/new">
                <Button type="button" variant="secondary" size="lg">
                  Start a new engagement
                </Button>
              </Link>
            </EmptyState>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            {HOW_IT_WORKS.map(([title, body], i) => (
              <div key={title} className="rounded-xl border border-edge bg-surface p-5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
