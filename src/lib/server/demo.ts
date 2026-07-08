// Demo engagement seeding — shared by the dashboard server action and the
// deployment self-test route. Pushes the Bluebird HVAC fixtures through the
// REAL pipeline: storage upload → classification → ingestion → adjustments.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyByRules } from "../ai/classifier";
import { ingestDocument, isParseable } from "./ingest";
import { logAudit } from "./audit";
import type { DocumentRow, EngagementRow } from "../db-types";

const DEMO_FILES = [
  "Bluebird-Operating-4821-Bank-Statement-2024.csv",
  "Bluebird-Payroll-Account-9917-Statement-2024.csv",
  "Bluebird-PnL-2024.csv",
];

export async function seedDemoCore(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<string> {
  const { data: engagement, error } = await supabase
    .from("engagements")
    .insert({
      org_id: orgId,
      name: "Demo — Project Bluebird",
      entity_name: "Bluebird HVAC LLC",
      period_start: "2024-01-01",
      period_end: "2024-12-31",
      is_demo: true,
      created_by: userId,
    })
    .select("*")
    .single<EngagementRow>();
  if (error || !engagement) throw new Error(error?.message ?? "Could not create demo engagement.");

  for (const fileName of DEMO_FILES) {
    const content = await readFile(join(process.cwd(), "fixtures", fileName));
    const documentId = crypto.randomUUID();
    const storagePath = `${orgId}/${engagement.id}/${documentId}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, content, { contentType: "text/csv" });
    if (uploadError) throw new Error(`Demo upload failed: ${uploadError.message}`);

    const classification = classifyByRules(fileName);
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        id: documentId,
        org_id: orgId,
        engagement_id: engagement.id,
        file_name: fileName,
        storage_path: storagePath,
        mime_type: "text/csv",
        size_bytes: content.byteLength,
        doc_type: classification.docType,
        period_start: classification.periodStart,
        period_end: classification.periodEnd,
        account_hint: classification.accountHint,
        classification_confidence: classification.confidence,
        classification_source: classification.source,
        status: "uploaded",
      })
      .select("*")
      .single<DocumentRow>();
    if (docError || !doc) throw new Error(docError?.message ?? "Could not register demo document.");

    if (isParseable(fileName, classification.docType)) {
      const result = await ingestDocument(supabase, doc, engagement, userId);
      if (!result.ok) throw new Error(`Demo ingest failed for ${fileName}: ${result.message}`);
    }
  }

  // Two example add-backs with real evidence links; the rest are left for the
  // user to discover (country club dues, owner comp normalization).
  const { data: settlementTxn } = await supabase
    .from("transactions")
    .select("id")
    .eq("engagement_id", engagement.id)
    .ilike("description", "%Litigation Settlement%")
    .maybeSingle();
  const { data: pnlDoc } = await supabase
    .from("documents")
    .select("id")
    .eq("engagement_id", engagement.id)
    .eq("doc_type", "pnl")
    .maybeSingle();
  const { data: leaseTxns } = await supabase
    .from("transactions")
    .select("id")
    .eq("engagement_id", engagement.id)
    .ilike("description", "%BMW Financial%")
    .limit(12);

  if (settlementTxn && pnlDoc) {
    const { data: adj } = await supabase
      .from("adjustments")
      .insert({
        org_id: orgId,
        engagement_id: engagement.id,
        name: "One-time litigation settlement",
        category: "one_time",
        rationale:
          "June 2024 settlement of the Reynolds warranty dispute — a non-recurring legal cost unrelated to ongoing operations.",
        amount_cents: 2_500_000,
        created_by: userId,
      })
      .select("id")
      .single();
    if (adj) {
      await supabase.from("adjustment_evidence").insert([
        { org_id: orgId, adjustment_id: adj.id, document_id: pnlDoc.id },
        { org_id: orgId, adjustment_id: adj.id, transaction_id: settlementTxn.id },
      ]);
    }
  }
  if (leaseTxns && leaseTxns.length === 12) {
    const { data: adj } = await supabase
      .from("adjustments")
      .insert({
        org_id: orgId,
        engagement_id: engagement.id,
        name: "Owner's personal vehicle lease",
        category: "personal_expense",
        rationale:
          "Monthly BMW lease is the owner's personal vehicle, paid from the operating account and booked to vehicle expense. Will not continue post-close.",
        amount_cents: 1_440_000,
        created_by: userId,
      })
      .select("id")
      .single();
    if (adj) {
      await supabase
        .from("adjustment_evidence")
        .insert(leaseTxns.map((t) => ({ org_id: orgId, adjustment_id: adj.id, transaction_id: t.id })));
    }
  }

  await logAudit(supabase, {
    orgId,
    engagementId: engagement.id,
    userId,
    action: "engagement.demo_seeded",
    entityType: "engagement",
    entityId: engagement.id,
  });

  return engagement.id;
}
