"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { seedDemoCore } from "./demo";
import { classifyByRules, classifyWithAI } from "../ai/classifier";
import { ingestDocument, isParseable } from "./ingest";
import { logAudit } from "./audit";
import { getEngagementBundle } from "./data";
import { analyzeEngagement } from "../analysis";
import type { DocumentRow, EngagementRow } from "../db-types";
import type { DocType, TxnClass } from "../types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function ensureOrg(): Promise<string> {
  const { supabase, user } = await requireUser();
  const orgName = `${user.email?.split("@")[0] ?? "My"}'s workspace`;
  const { data, error } = await supabase.rpc("bootstrap_org", { p_name: orgName });
  if (error) throw new Error(`Could not set up your workspace: ${error.message}`);
  return data as string;
}

export async function createEngagement(formData: FormData) {
  const { supabase, user } = await requireUser();
  const orgId = await ensureOrg();

  const name = String(formData.get("name") ?? "").trim();
  const entityName = String(formData.get("entity_name") ?? "").trim();
  const periodStart = String(formData.get("period_start") ?? ""); // YYYY-MM
  const periodEnd = String(formData.get("period_end") ?? "");
  if (!name || !entityName || !periodStart || !periodEnd) {
    throw new Error("All fields are required.");
  }
  const endDate = new Date(Date.UTC(Number(periodEnd.slice(0, 4)), Number(periodEnd.slice(5, 7)), 0));

  const { data, error } = await supabase
    .from("engagements")
    .insert({
      org_id: orgId,
      name,
      entity_name: entityName,
      period_start: `${periodStart}-01`,
      period_end: endDate.toISOString().slice(0, 10),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    orgId,
    engagementId: data.id,
    userId: user.id,
    action: "engagement.created",
    entityType: "engagement",
    entityId: data.id,
    detail: { name, entityName, periodStart, periodEnd },
  });

  redirect(`/engagements/${data.id}/documents`);
}

// Called by the uploader after each file lands in storage: registers the
// document, classifies it, and ingests it when we're confident about the type.
export async function documentUploadComplete(input: {
  documentId: string;
  engagementId: string;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
}) {
  const { supabase, user } = await requireUser();

  const { data: engagement } = await supabase
    .from("engagements")
    .select("*")
    .eq("id", input.engagementId)
    .maybeSingle<EngagementRow>();
  if (!engagement) return { ok: false, message: "Engagement not found." };

  // Sample text content (when it's a text format) to help classification.
  let sample: string | undefined;
  const ext = input.fileName.toLowerCase().split(".").pop() ?? "";
  if (["csv", "ofx", "qfx", "qbo", "txt"].includes(ext)) {
    const { data: blob } = await supabase.storage.from("documents").download(input.storagePath);
    if (blob) sample = (await blob.text()).slice(0, 4000);
  }

  let classification = classifyByRules(input.fileName, sample);
  if (classification.confidence < 0.8 && sample) {
    classification = await classifyWithAI(input.fileName, sample, classification);
  }

  const confident = classification.confidence >= 0.7 && classification.docType !== "unclassified";
  const parseable = isParseable(input.fileName, classification.docType);

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      id: input.documentId,
      org_id: engagement.org_id,
      engagement_id: engagement.id,
      file_name: input.fileName,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      doc_type: classification.docType,
      period_start: classification.periodStart,
      period_end: classification.periodEnd,
      account_hint: classification.accountHint,
      classification_confidence: classification.confidence,
      classification_source: classification.source,
      status: confident ? (parseable ? "uploaded" : "confirmed") : "needs_review",
    })
    .select("*")
    .single<DocumentRow>();
  if (error || !doc) return { ok: false, message: error?.message ?? "Could not save document." };

  await logAudit(supabase, {
    orgId: engagement.org_id,
    engagementId: engagement.id,
    userId: user.id,
    action: "document.uploaded",
    entityType: "document",
    entityId: doc.id,
    detail: {
      fileName: input.fileName,
      classifiedAs: classification.docType,
      confidence: classification.confidence,
      source: classification.source,
    },
  });

  let message = `Classified as ${classification.docType.replace("_", " ")}`;
  if (confident && parseable) {
    const result = await ingestDocument(supabase, doc, engagement, user.id);
    message = result.message;
  } else if (!confident) {
    message = "Needs a quick confirmation of what this document is.";
  }

  revalidatePath(`/engagements/${engagement.id}`, "layout");
  return { ok: true, message };
}

// User confirms/overrides a document's type (and account name), then we ingest.
export async function confirmDocument(formData: FormData) {
  const { supabase, user } = await requireUser();
  const documentId = String(formData.get("document_id"));
  const docType = String(formData.get("doc_type")) as DocType;
  const accountHint = String(formData.get("account_hint") ?? "").trim() || null;

  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle<DocumentRow>();
  if (!doc) throw new Error("Document not found.");

  const { data: engagement } = await supabase
    .from("engagements")
    .select("*")
    .eq("id", doc.engagement_id)
    .single<EngagementRow>();

  const updated: DocumentRow = {
    ...doc,
    doc_type: docType,
    account_hint: accountHint ?? doc.account_hint,
  };
  await supabase
    .from("documents")
    .update({
      doc_type: docType,
      account_hint: updated.account_hint,
      classification_source: "user",
      classification_confidence: 1,
      status: "confirmed",
    })
    .eq("id", documentId);

  await logAudit(supabase, {
    orgId: doc.org_id,
    engagementId: doc.engagement_id,
    userId: user.id,
    action: "document.type_confirmed",
    entityType: "document",
    entityId: doc.id,
    detail: { docType, accountHint },
  });

  if (engagement && isParseable(doc.file_name, docType)) {
    await ingestDocument(supabase, updated, engagement, user.id);
  }
  revalidatePath(`/engagements/${doc.engagement_id}`, "layout");
}

export async function classifyTransaction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const engagementId = String(formData.get("engagement_id"));
  const transactionId = String(formData.get("transaction_id"));
  const cls = String(formData.get("class")) as TxnClass;
  const note = String(formData.get("note") ?? "").trim() || null;

  const { data: engagement } = await supabase
    .from("engagements")
    .select("org_id")
    .eq("id", engagementId)
    .single();
  if (!engagement) throw new Error("Engagement not found.");

  const { error } = await supabase.from("txn_classifications").upsert(
    {
      org_id: engagement.org_id,
      engagement_id: engagementId,
      transaction_id: transactionId,
      class: cls,
      note,
      source: "user",
      created_by: user.id,
    },
    { onConflict: "transaction_id" },
  );
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    orgId: engagement.org_id,
    engagementId,
    userId: user.id,
    action: "transaction.classified",
    entityType: "transaction",
    entityId: transactionId,
    detail: { class: cls, note },
  });
  revalidatePath(`/engagements/${engagementId}`, "layout");
}

export async function createAdjustment(formData: FormData) {
  const { supabase, user } = await requireUser();
  const engagementId = String(formData.get("engagement_id"));
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category"));
  const rationale = String(formData.get("rationale") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").replace(/[$,\s]/g, "");
  const documentIds = formData.getAll("evidence_document").map(String).filter(Boolean);
  const transactionIds = formData.getAll("evidence_transaction").map(String).filter(Boolean);

  if (!name || !rationale) throw new Error("Name and rationale are required.");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount === 0) throw new Error("Enter a non-zero dollar amount.");
  if (documentIds.length + transactionIds.length === 0) {
    throw new Error("Every adjustment needs at least one piece of evidence (a document or transactions).");
  }

  const { data: engagement } = await supabase
    .from("engagements")
    .select("org_id")
    .eq("id", engagementId)
    .single();
  if (!engagement) throw new Error("Engagement not found.");

  const { data: adjustment, error } = await supabase
    .from("adjustments")
    .insert({
      org_id: engagement.org_id,
      engagement_id: engagementId,
      name,
      category,
      rationale,
      amount_cents: Math.round(amount * 100),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !adjustment) throw new Error(error?.message ?? "Could not save adjustment.");

  const evidenceRows = [
    ...documentIds.map((id) => ({
      org_id: engagement.org_id,
      adjustment_id: adjustment.id,
      document_id: id,
    })),
    ...transactionIds.map((id) => ({
      org_id: engagement.org_id,
      adjustment_id: adjustment.id,
      transaction_id: id,
    })),
  ];
  const { error: evidenceError } = await supabase.from("adjustment_evidence").insert(evidenceRows);
  if (evidenceError) {
    await supabase.from("adjustments").delete().eq("id", adjustment.id);
    throw new Error(`Could not save evidence: ${evidenceError.message}`);
  }

  await logAudit(supabase, {
    orgId: engagement.org_id,
    engagementId,
    userId: user.id,
    action: "adjustment.created",
    entityType: "adjustment",
    entityId: adjustment.id,
    detail: { name, category, amountCents: Math.round(amount * 100), evidence: evidenceRows.length },
  });
  revalidatePath(`/engagements/${engagementId}`, "layout");
}

export async function deleteAdjustment(formData: FormData) {
  const { supabase, user } = await requireUser();
  const engagementId = String(formData.get("engagement_id"));
  const adjustmentId = String(formData.get("adjustment_id"));

  const { data: adjustment } = await supabase
    .from("adjustments")
    .select("org_id,name")
    .eq("id", adjustmentId)
    .single();
  await supabase.from("adjustments").delete().eq("id", adjustmentId);

  if (adjustment) {
    await logAudit(supabase, {
      orgId: adjustment.org_id,
      engagementId,
      userId: user.id,
      action: "adjustment.deleted",
      entityType: "adjustment",
      entityId: adjustmentId,
      detail: { name: adjustment.name },
    });
  }
  revalidatePath(`/engagements/${engagementId}`, "layout");
}

export async function acknowledgeGate(formData: FormData) {
  const { supabase, user } = await requireUser();
  const engagementId = String(formData.get("engagement_id"));
  const gateKey = String(formData.get("gate_key"));
  const note = String(formData.get("note") ?? "").trim();
  if (!note) throw new Error("An explanation is required — it will be disclosed in the report.");

  const { data: engagement } = await supabase
    .from("engagements")
    .select("org_id")
    .eq("id", engagementId)
    .single();
  if (!engagement) throw new Error("Engagement not found.");

  const { error } = await supabase.from("gate_acknowledgements").upsert(
    {
      org_id: engagement.org_id,
      engagement_id: engagementId,
      gate_key: gateKey,
      note,
      created_by: user.id,
    },
    { onConflict: "engagement_id,gate_key" },
  );
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    orgId: engagement.org_id,
    engagementId,
    userId: user.id,
    action: "gate.acknowledged",
    entityType: "gate",
    entityId: gateKey,
    detail: { note },
  });
  revalidatePath(`/engagements/${engagementId}`, "layout");
}

export async function finalizeEngagement(formData: FormData) {
  const { supabase, user } = await requireUser();
  const engagementId = String(formData.get("engagement_id"));

  const bundle = await getEngagementBundle(supabase, engagementId);
  if (!bundle) throw new Error("Engagement not found.");
  const analysis = analyzeEngagement(bundle);
  if (!analysis.gatesPassed) {
    throw new Error("Validation gates are not all resolved — see the report page.");
  }

  await supabase.from("engagements").update({ status: "finalized" }).eq("id", engagementId);
  await logAudit(supabase, {
    orgId: bundle.engagement.org_id,
    engagementId,
    userId: user.id,
    action: "engagement.finalized",
    entityType: "engagement",
    entityId: engagementId,
  });
  revalidatePath(`/engagements/${engagementId}`, "layout");
}


// Seeds Bluebird HVAC through the real pipeline (see ./demo.ts) and jumps
// straight into the engagement.
export async function seedDemoEngagement() {
  const { supabase, user } = await requireUser();
  const orgId = await ensureOrg();
  const engagementId = await seedDemoCore(supabase, orgId, user.id);
  redirect(`/engagements/${engagementId}`);
}

// ── Deal structure / DSCR ───────────────────────────────────────────────────

function dollarsToCents(raw: FormDataEntryValue | null): number {
  const n = Number(String(raw ?? "0").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function intOrZero(raw: FormDataEntryValue | null): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function pctToBps(raw: FormDataEntryValue | null): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0; // 9.5% -> 950 bps
}

export async function saveDealStructure(formData: FormData) {
  const { supabase, user } = await requireUser();
  const engagementId = String(formData.get("engagement_id"));

  const { data: engagement } = await supabase
    .from("engagements")
    .select("org_id")
    .eq("id", engagementId)
    .single();
  if (!engagement) throw new Error("Engagement not found.");

  const row = {
    org_id: engagement.org_id,
    engagement_id: engagementId,
    purchase_price_cents: dollarsToCents(formData.get("purchase_price")),
    equity_injection_cents: dollarsToCents(formData.get("equity_injection")),
    senior_debt_cents: dollarsToCents(formData.get("senior_debt")),
    senior_rate_bps: pctToBps(formData.get("senior_rate")),
    senior_term_months: intOrZero(formData.get("senior_term_months")),
    seller_note_cents: dollarsToCents(formData.get("seller_note")),
    seller_note_rate_bps: pctToBps(formData.get("seller_note_rate")),
    seller_note_term_months: intOrZero(formData.get("seller_note_term_months")),
    seller_note_io_months: intOrZero(formData.get("seller_note_io_months")),
    existing_debt_cents: dollarsToCents(formData.get("existing_debt")),
    existing_debt_rate_bps: pctToBps(formData.get("existing_debt_rate")),
    existing_debt_term_months: intOrZero(formData.get("existing_debt_term_months")),
    created_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("deal_structures")
    .upsert(row, { onConflict: "engagement_id" });
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    orgId: engagement.org_id,
    engagementId,
    userId: user.id,
    action: "deal_structure.saved",
    entityType: "deal_structure",
    detail: {
      purchasePriceCents: row.purchase_price_cents,
      seniorDebtCents: row.senior_debt_cents,
      sellerNoteCents: row.seller_note_cents,
      existingDebtCents: row.existing_debt_cents,
    },
  });
  revalidatePath(`/engagements/${engagementId}`, "layout");
}

export async function deleteDealStructure(formData: FormData) {
  const { supabase, user } = await requireUser();
  const engagementId = String(formData.get("engagement_id"));

  const { data: engagement } = await supabase
    .from("engagements")
    .select("org_id")
    .eq("id", engagementId)
    .single();
  if (!engagement) throw new Error("Engagement not found.");

  await supabase.from("deal_structures").delete().eq("engagement_id", engagementId);
  await logAudit(supabase, {
    orgId: engagement.org_id,
    engagementId,
    userId: user.id,
    action: "deal_structure.deleted",
    entityType: "deal_structure",
  });
  revalidatePath(`/engagements/${engagementId}`, "layout");
}
