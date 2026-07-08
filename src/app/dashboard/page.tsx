import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ensureOrg, seedDemoEngagement } from "@/lib/server/actions";
import { Badge, Button, Card } from "@/components/ui";
import type { EngagementRow } from "@/lib/db-types";
import { SignOutButton } from "@/components/signout";

// Demo seeding pushes ~530 transactions through the real pipeline.
export const maxDuration = 60;

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const orgId = await ensureOrg();

  const { data: org } = await supabase.from("orgs").select("name").eq("id", orgId).single();
  const { data: engagements } = await supabase
    .from("engagements")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<EngagementRow[]>();

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">QoE Lite</h1>
          <p className="text-sm text-slate-500">
            {org?.name} · {user?.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={seedDemoEngagement}>
            <Button variant="secondary" type="submit">
              Load demo engagement
            </Button>
          </form>
          <Link href="/engagements/new">
            <Button type="button">New engagement</Button>
          </Link>
          <SignOutButton />
        </div>
      </header>

      <Card
        title="Engagements"
        subtitle="Each engagement is one deal: upload the seller's documents, reconcile, and generate the QoE report."
      >
        {engagements && engagements.length > 0 ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {engagements.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-3">
                <div>
                  <Link
                    href={`/engagements/${e.id}`}
                    className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                  >
                    {e.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {e.entity_name} · {e.period_start.slice(0, 7)} → {e.period_end.slice(0, 7)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {e.is_demo && <Badge tone="blue">demo</Badge>}
                  <Badge tone={e.status === "finalized" ? "green" : "gray"}>{e.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-8 text-center text-sm text-slate-500">
            <p className="mb-3">No engagements yet.</p>
            <p>
              Start with <span className="font-medium">Load demo engagement</span> to see a full
              worked example (Bluebird HVAC), or create a new engagement and drop in your own
              documents.
            </p>
          </div>
        )}
      </Card>
    </main>
  );
}
