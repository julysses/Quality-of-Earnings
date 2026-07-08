import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui";
import { TabNav } from "@/components/tab-nav";
import type { EngagementRow } from "@/lib/db-types";

export default async function EngagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: engagement } = await supabase
    .from("engagements")
    .select("*")
    .eq("id", id)
    .maybeSingle<EngagementRow>();
  if (!engagement) notFound();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-1 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Dashboard
        </Link>
        <Badge tone={engagement.status === "finalized" ? "green" : "gray"}>
          {engagement.status}
        </Badge>
      </div>
      <h1 className="text-xl font-bold">{engagement.name}</h1>
      <p className="mb-4 text-sm text-slate-500">
        {engagement.entity_name} · {engagement.period_start.slice(0, 7)} →{" "}
        {engagement.period_end.slice(0, 7)}
      </p>
      <TabNav
        base={`/engagements/${id}`}
        tabs={[
          ["", "Overview"],
          ["/documents", "Documents"],
          ["/proof-of-cash", "Proof of Cash"],
          ["/ebitda-bridge", "EBITDA Bridge"],
          ["/report", "Report"],
        ]}
      />
      <div className="mt-4">{children}</div>
    </main>
  );
}
