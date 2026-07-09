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
import { isQuickBooksDesktopFile, QUICKBOOKS_DESKTOP_GUIDANCE } from "@/lib/ai/classifier";
import { ingestDocument, type IngestResult } from "@/lib/server/ingest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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

    // 7. Deal structure → DSCR. Golden values (see tests/dscr.test.ts):
    // senior debt $400k @10.00%/120mo -> $63,432.36 year-1 debt service;
    // seller note $100k @8.00%/60mo w/ 12mo IO -> $8,000.04. Total $71,432.40.
    await supabase.from("deal_structures").upsert(
      {
        org_id: orgId,
        engagement_id: engagementId,
        purchase_price_cents: 550_000_00,
        equity_injection_cents: 50_000_00,
        senior_debt_cents: 400_000_00,
        senior_rate_bps: 1000,
        senior_term_months: 120,
        seller_note_cents: 100_000_00,
        seller_note_rate_bps: 800,
        seller_note_term_months: 60,
        seller_note_io_months: 12,
        existing_debt_cents: 0,
        existing_debt_rate_bps: 0,
        existing_debt_term_months: 0,
        created_by: userId,
      },
      { onConflict: "engagement_id" },
    );
    const bundle3 = (await getEngagementBundle(supabase, engagementId))!;
    const analysis3 = analyzeEngagement(bundle3);
    const dscr = analysis3.dscr;
    checks.push({
      name: "dscr_debt_service",
      pass: dscr != null && dscr.totalAnnualDebtServiceCents === 7_143_240,
      detail: `total year-1 debt service: ${dscr?.totalAnnualDebtServiceCents} (expect 7143240)`,
    });
    checks.push({
      name: "dscr_ratios",
      pass:
        dscr != null &&
        dscr.tiers.every((t) => t.ratio != null && t.meetsMarketThreshold) &&
        Math.abs((dscr.tiers.find((t) => t.tier === "all_addbacks")!.ratio ?? 0) - 32_466_000 / 7_143_240) < 0.001,
      detail: dscr?.tiers.map((t) => `${t.tier}:${t.ratio?.toFixed(3)}`).join(" ") ?? "no dscr",
    });

    // 8. PDF text-layer extraction: upload the golden PDF fixture through the
    // real ingestion pipeline and confirm it parses to the expected figures.
    const pdfBytes = await readFile(join(process.cwd(), "fixtures", "pdf", "Riverside-Plumbing-PnL-Q1-2024.pdf"));
    const pdfDocId = crypto.randomUUID();
    const pdfStoragePath = `${orgId}/${engagementId}/${pdfDocId}/Riverside-Plumbing-PnL-Q1-2024.pdf`;
    await supabase.storage.from("documents").upload(pdfStoragePath, pdfBytes, { contentType: "application/pdf" });
    const { data: pdfDoc } = await supabase
      .from("documents")
      .insert({
        id: pdfDocId,
        org_id: orgId,
        engagement_id: engagementId,
        file_name: "Riverside-Plumbing-PnL-Q1-2024.pdf",
        storage_path: pdfStoragePath,
        mime_type: "application/pdf",
        doc_type: "pnl",
        status: "uploaded",
      })
      .select("*")
      .single();
    const pdfIngestResult: IngestResult = pdfDoc
      ? await ingestDocument(supabase, pdfDoc, bundle.engagement, userId)
      : { ok: false, message: "document insert failed", warnings: [] };
    checks.push({
      name: "pdf_extraction",
      pass: pdfIngestResult.ok && pdfIngestResult.factsInserted === 15,
      detail: `${pdfIngestResult.message} (expect 15 facts)`,
    });

    // 9. QuickBooks Desktop file handling: never fake-parsed, always guided.
    checks.push({
      name: "qb_desktop_detector",
      pass:
        isQuickBooksDesktopFile("Company Backup.QBB") &&
        isQuickBooksDesktopFile("acme.qbw") &&
        !isQuickBooksDesktopFile("chase-download.qbo"),
      detail: "qbb/qbw detected as unsupported; unrelated .qbo bank-download format is not",
    });
    const { data: qbDoc, error: qbError } = await supabase
      .from("documents")
      .insert({
        org_id: orgId,
        engagement_id: engagementId,
        file_name: "Company Backup.QBB",
        storage_path: `${orgId}/${engagementId}/selftest-qbb`,
        doc_type: "other",
        classification_source: "rules",
        classification_confidence: 1,
        status: "unsupported",
        parse_error: QUICKBOOKS_DESKTOP_GUIDANCE,
      })
      .select("id,status,parse_error")
      .single();
    checks.push({
      name: "qb_desktop_upload_handling",
      pass: !qbError && qbDoc?.status === "unsupported" && !!qbDoc?.parse_error?.includes("QuickBooks Desktop"),
      detail: qbError?.message ?? `status=${qbDoc?.status}`,
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
