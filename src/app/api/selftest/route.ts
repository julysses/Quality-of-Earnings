// Deployment self-test: exercises the full pipeline against the live Supabase
// project — sign-in, demo seed (storage upload → classification → ingestion),
// proof of cash, workbench resolution, gate acknowledgement, EBITDA bridge —
// and returns a structured checklist. Gated by real Supabase credentials (the
// caller must authenticate as an existing user); all writes land in that
// user's own org under RLS, never in anyone else's data.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { seedDemoCore } from "@/lib/server/demo";
import { getEngagementBundle } from "@/lib/server/data";
import { analyzeEngagement } from "@/lib/analysis";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  const password = req.nextUrl.searchParams.get("password");
  if (!email || !password) {
    return NextResponse.json({ error: "email and password query params required" }, { status: 401 });
  }

  const checks: Check[] = [];
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  try {
    // 1. Auth
    const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authError || !auth.user) {
      return NextResponse.json(
        { checks: [{ name: "auth", pass: false, detail: authError?.message ?? "no user" }] },
        { status: 500 },
      );
    }
    checks.push({ name: "auth", pass: true, detail: `signed in as ${email}` });
    const userId = auth.user.id;

    // 2. Org bootstrap (idempotent)
    const { data: orgId, error: orgError } = await supabase.rpc("bootstrap_org", {
      p_name: "Self-test workspace",
    });
    checks.push({
      name: "org_bootstrap",
      pass: !orgError && !!orgId,
      detail: orgError?.message ?? `org ${orgId}`,
    });

    // 3. Demo seed through the real pipeline
    const engagementId = await seedDemoCore(supabase, orgId as string, userId);
    checks.push({ name: "demo_seed", pass: true, detail: `engagement ${engagementId}` });

    // 4. Analysis
    const bundle = (await getEngagementBundle(supabase, engagementId))!;
    let analysis = analyzeEngagement(bundle);
    // Fixture totals: 231 bank txns (194 operating + 36 payroll + specials)
    // and 144 facts (12 canonical categories × 12 months).
    checks.push({
      name: "ingestion",
      pass: bundle.transactions.length === 231 && bundle.facts.length === 144 && bundle.accounts.length === 2,
      detail: `${bundle.transactions.length} txns, ${bundle.facts.length} facts, ${bundle.accounts.length} accounts (expect 231/144/2)`,
    });
    checks.push({
      name: "auto_classification",
      pass: bundle.classifications.filter((c) => c.source === "auto").length === 36,
      detail: `${bundle.classifications.length} classifications (expect 36 auto: 24 transfer legs + 12 owner draws)`,
    });
    checks.push({
      name: "continuity",
      pass: analysis.completeness.breaks.length === 0 && analysis.completeness.missingMonths.length === 0,
      detail: `${analysis.completeness.breaks.length} breaks, missing: ${analysis.completeness.missingMonths.join(",") || "none"}`,
    });
    checks.push({
      name: "poc_flags",
      pass: JSON.stringify(analysis.poc.flaggedMonths) === JSON.stringify(["2024-03", "2024-09"]),
      detail: `flagged: ${analysis.poc.flaggedMonths.join(", ")}`,
    });
    checks.push({
      name: "bridge",
      pass: analysis.bridge.ebitdaCents === 28_526_000 && analysis.bridge.adjustedEbitdaCents === 32_466_000,
      detail: `EBITDA ${analysis.bridge.ebitdaCents}¢, adjusted ${analysis.bridge.adjustedEbitdaCents}¢ (expect 28526000 / 32466000)`,
    });

    // 5. Workbench: classify the March owner contribution → flag clears
    const march = bundle.transactions.find((t) => t.description.includes("Wire In - J Bluebird"));
    if (march) {
      await supabase.from("txn_classifications").upsert(
        {
          org_id: orgId,
          engagement_id: engagementId,
          transaction_id: march.id,
          class: "owner_contribution",
          note: "Self-test: owner capital contribution",
          source: "user",
          created_by: userId,
        },
        { onConflict: "transaction_id" },
      );
    }
    // 6. Acknowledge the September variance
    await supabase.from("gate_acknowledgements").upsert(
      {
        org_id: orgId,
        engagement_id: engagementId,
        gate_key: "poc:2024-09",
        note: "Self-test: unexplained counter deposit disclosed as an exception.",
        created_by: userId,
      },
      { onConflict: "engagement_id,gate_key" },
    );

    const bundle2 = (await getEngagementBundle(supabase, engagementId))!;
    analysis = analyzeEngagement(bundle2);
    checks.push({
      name: "workbench_resolution",
      pass: JSON.stringify(analysis.poc.flaggedMonths) === JSON.stringify(["2024-09"]),
      detail: `flagged after classifying March: ${analysis.poc.flaggedMonths.join(", ") || "none"}`,
    });
    checks.push({
      name: "gates_pass_after_ack",
      pass: analysis.gatesPassed,
      detail: analysis.gates
        .map((g) => `${g.key}:${g.passed ? "pass" : g.acknowledged ? "ack" : "OPEN"}`)
        .join(" "),
    });

    const allPass = checks.every((c) => c.pass);
    return NextResponse.json(
      { allPass, engagementId, checks },
      { status: allPass ? 200 : 500 },
    );
  } catch (e) {
    checks.push({ name: "exception", pass: false, detail: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ allPass: false, checks }, { status: 500 });
  }
}
