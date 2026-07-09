import Link from "next/link";
import { loadAnalysis } from "@/lib/server/load";
import { computeSteps } from "@/lib/steps";
import { Badge, ProgressBar } from "@/components/ui";
import { Stepper } from "@/components/stepper";
import { NextStep } from "@/components/next-step";

export default async function EngagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { bundle, analysis } = await loadAnalysis(id);
  const engagement = bundle.engagement;
  const plan = computeSteps(bundle, analysis);

  return (
    <div>
      <div className="no-print mb-5">
        <div className="mb-1 flex items-center justify-between">
          <Link href="/dashboard" className="text-xs font-medium text-muted hover:text-ink">
            ← All engagements
          </Link>
          <div className="flex items-center gap-2">
            {engagement.is_demo && <Badge tone="blue">demo</Badge>}
            <Badge tone={engagement.status === "finalized" ? "green" : "gray"} dot>
              {engagement.status === "finalized" ? "Finalized" : "In progress"}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">{engagement.name}</h1>
            <p className="text-sm text-muted">
              {engagement.entity_name} · {engagement.period_start.slice(0, 7)} →{" "}
              {engagement.period_end.slice(0, 7)}
            </p>
          </div>
          <div className="w-40">
            <p className="mb-1 text-right text-xs font-medium text-muted">
              {plan.completedCount} of {plan.steps.length} steps
            </p>
            <ProgressBar value={plan.completedCount} max={plan.steps.length} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Stepper steps={plan.steps} />
        <NextStep next={plan.next} />
      </div>

      <div className="mt-5">{children}</div>
    </div>
  );
}
