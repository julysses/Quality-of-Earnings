// Ingestion pipeline: download a stored document, parse it by type, load the
// canonical ledger (transactions / financial facts), then re-run deterministic
// auto-classification across the engagement. Idempotent per document —
// re-ingesting deletes that document's prior rows first.

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBankCsv, type ParsedBankRow } from "../parsers/bank-csv";
import { parseOfx } from "../parsers/ofx";
import { parsePnlCsv } from "../parsers/pnl-csv";
import { parseBankPdf } from "../parsers/bank-pdf";
import { parsePnlPdf } from "../parsers/pnl-pdf";
import { extractPdfViaVision, isVisionFallbackEnabled } from "../ai/pdf-vision";
import { autoClassify } from "../engine/auto-classify";
import { logAudit } from "./audit";
import type { DocumentRow, EngagementRow, TransactionRow } from "../db-types";
import type { BankTxn, Fact } from "../types";

export interface IngestResult {
  ok: boolean;
  message: string;
  warnings: string[];
  transactionsInserted?: number;
  factsInserted?: number;
}

const PARSEABLE_EXTENSIONS = new Set(["csv", "ofx", "qfx", "qbo", "pdf"]);

// Below this many extracted characters, a PDF is almost certainly a scanned
// image with no text layer — text extraction can't help, only vision can.
const MIN_TEXT_LAYER_LENGTH = 40;

export function isParseable(fileName: string, docType: string): boolean {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return PARSEABLE_EXTENSIONS.has(ext) && (docType === "bank_statement" || docType === "pnl");
}

interface BankParseResult {
  rows: ParsedBankRow[];
  errors: string[];
  source: "csv" | "ofx" | "pdf_text" | "pdf_vision";
}
interface PnlParseResult {
  facts: Fact[];
  warnings: string[];
  errors: string[];
  source: "csv" | "pdf_text" | "pdf_vision";
}

export async function ingestDocument(
  supabase: SupabaseClient,
  doc: DocumentRow,
  engagement: EngagementRow,
  userId: string,
): Promise<IngestResult> {
  const fail = async (message: string): Promise<IngestResult> => {
    await supabase
      .from("documents")
      .update({ status: "failed", parse_error: message })
      .eq("id", doc.id);
    return { ok: false, message, warnings: [] };
  };

  const { data: blob, error: downloadError } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);
  if (downloadError || !blob) {
    return fail(`Could not download the file: ${downloadError?.message ?? "unknown error"}`);
  }

  const ext = doc.file_name.toLowerCase().split(".").pop() ?? "";

  if (doc.doc_type === "bank_statement") {
    const parsed = await parseBankInput(ext, blob, doc.file_name);
    return ingestBankStatement(supabase, doc, engagement, userId, parsed);
  }
  if (doc.doc_type === "pnl") {
    const parsed = await parsePnlInput(ext, blob, doc.file_name);
    return ingestPnl(supabase, doc, engagement, userId, parsed);
  }
  return fail(`Don't know how to parse a "${doc.doc_type}" document yet.`);
}

async function parseBankInput(ext: string, blob: Blob, fileName: string): Promise<BankParseResult> {
  if (ext === "pdf") {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const textResult = await parseBankPdf(bytes);
    if (textResult.rows.length > 0 || textResult.extractedTextLength >= MIN_TEXT_LAYER_LENGTH) {
      return { rows: textResult.rows, errors: textResult.errors, source: "pdf_text" };
    }
    // No usable text layer — likely a scanned statement. Try Claude vision
    // if configured; never blocks the pipeline if it isn't.
    if (isVisionFallbackEnabled()) {
      const vision = await extractPdfViaVision(bytes, fileName, "bank_statement");
      return { rows: vision.rows ?? [], errors: vision.errors, source: "pdf_vision" };
    }
    return {
      rows: [],
      errors: [
        "This looks like a scanned PDF with no selectable text, so it can't be read automatically. Try exporting the statement as CSV instead, or upload a digitally-generated PDF.",
      ],
      source: "pdf_text",
    };
  }
  const content = await blob.text();
  const parsed = ext === "csv" ? parseBankCsv(content) : parseOfx(content);
  return { rows: parsed.rows, errors: parsed.errors, source: ext === "csv" ? "csv" : "ofx" };
}

async function parsePnlInput(ext: string, blob: Blob, fileName: string): Promise<PnlParseResult> {
  if (ext === "pdf") {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const textResult = await parsePnlPdf(bytes);
    if (textResult.facts.length > 0 || textResult.extractedTextLength >= MIN_TEXT_LAYER_LENGTH) {
      return { facts: textResult.facts, warnings: textResult.warnings, errors: textResult.errors, source: "pdf_text" };
    }
    if (isVisionFallbackEnabled()) {
      const vision = await extractPdfViaVision(bytes, fileName, "pnl");
      return { facts: vision.facts ?? [], warnings: [], errors: vision.errors, source: "pdf_vision" };
    }
    return {
      facts: [],
      warnings: [],
      errors: [
        "This looks like a scanned PDF with no selectable text, so it can't be read automatically. Try exporting the P&L as CSV instead, or upload a digitally-generated PDF.",
      ],
      source: "pdf_text",
    };
  }
  const content = await blob.text();
  const parsed = parsePnlCsv(content);
  return { facts: parsed.facts, warnings: parsed.warnings, errors: parsed.errors, source: "csv" };
}

async function ingestBankStatement(
  supabase: SupabaseClient,
  doc: DocumentRow,
  engagement: EngagementRow,
  userId: string,
  parsed: BankParseResult,
): Promise<IngestResult> {
  if (parsed.rows.length === 0) {
    const message = parsed.errors[0] ?? "No transactions found in this file.";
    await supabase.from("documents").update({ status: "failed", parse_error: message }).eq("id", doc.id);
    return { ok: false, message, warnings: parsed.errors };
  }

  // Find or create the bank account this statement belongs to.
  const accountName = doc.account_hint?.trim() || doc.file_name.replace(/\.[^.]+$/, "");
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .upsert(
      { org_id: doc.org_id, engagement_id: doc.engagement_id, name: accountName, kind: "bank" },
      { onConflict: "engagement_id,name" },
    )
    .select("id")
    .single();
  if (accountError || !account) {
    return { ok: false, message: `Could not create account: ${accountError?.message}`, warnings: [] };
  }

  // Idempotent re-ingest: replace this document's transactions.
  await supabase.from("transactions").delete().eq("document_id", doc.id);

  const rows = parsed.rows.map((r: ParsedBankRow) => ({
    org_id: doc.org_id,
    engagement_id: doc.engagement_id,
    account_id: account.id,
    document_id: doc.id,
    txn_date: r.date,
    description: r.description,
    amount_cents: r.amountCents,
    balance_cents: r.balanceCents,
    source_line: r.sourceLine,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("transactions").insert(rows.slice(i, i + 500));
    if (error) {
      return { ok: false, message: `Failed to save transactions: ${error.message}`, warnings: [] };
    }
  }

  const dates = parsed.rows.map((r) => r.date).sort();
  await supabase
    .from("documents")
    .update({
      status: "parsed",
      parse_error: null,
      period_start: doc.period_start ?? dates[0],
      period_end: doc.period_end ?? dates[dates.length - 1],
    })
    .eq("id", doc.id);

  await runAutoClassification(supabase, doc.engagement_id, doc.org_id);

  await logAudit(supabase, {
    orgId: doc.org_id,
    engagementId: doc.engagement_id,
    userId,
    action: "document.ingested",
    entityType: "document",
    entityId: doc.id,
    detail: { docType: "bank_statement", transactions: rows.length, account: accountName, source: parsed.source },
  });

  const sourceNote = parsed.source === "pdf_text" ? " (extracted from PDF)" : parsed.source === "pdf_vision" ? " (extracted from scanned PDF via AI)" : "";
  return {
    ok: true,
    message: `Loaded ${rows.length} transactions into "${accountName}"${sourceNote}.`,
    warnings: parsed.errors,
    transactionsInserted: rows.length,
  };
}

async function ingestPnl(
  supabase: SupabaseClient,
  doc: DocumentRow,
  engagement: EngagementRow,
  userId: string,
  parsed: PnlParseResult,
): Promise<IngestResult> {
  if (parsed.errors.length > 0 && parsed.facts.length === 0) {
    const message = parsed.errors[0] ?? "No monthly figures found in this file.";
    await supabase.from("documents").update({ status: "failed", parse_error: message }).eq("id", doc.id);
    return { ok: false, message, warnings: parsed.warnings };
  }
  if (parsed.facts.length === 0) {
    const message = "No monthly figures found in this file.";
    await supabase.from("documents").update({ status: "failed", parse_error: message }).eq("id", doc.id);
    return { ok: false, message, warnings: parsed.warnings };
  }

  await supabase.from("financial_facts").delete().eq("document_id", doc.id);

  const rows = parsed.facts.map((f) => ({
    org_id: doc.org_id,
    engagement_id: doc.engagement_id,
    month: `${f.month}-01`,
    category_key: f.categoryKey,
    amount_cents: f.amountCents,
    source: "pnl_csv",
    document_id: doc.id,
  }));
  const { error } = await supabase.from("financial_facts").insert(rows);
  if (error) {
    return { ok: false, message: `Failed to save P&L figures: ${error.message}`, warnings: parsed.warnings };
  }

  const months = parsed.facts.map((f) => f.month).sort();
  await supabase
    .from("documents")
    .update({
      status: "parsed",
      parse_error: null,
      period_start: doc.period_start ?? `${months[0]}-01`,
      period_end: doc.period_end ?? `${months[months.length - 1]}-28`,
    })
    .eq("id", doc.id);

  await logAudit(supabase, {
    orgId: doc.org_id,
    engagementId: doc.engagement_id,
    userId,
    action: "document.ingested",
    entityType: "document",
    entityId: doc.id,
    detail: { docType: "pnl", facts: rows.length, warnings: parsed.warnings.length, source: parsed.source },
  });

  const sourceNote = parsed.source === "pdf_text" ? " (extracted from PDF)" : parsed.source === "pdf_vision" ? " (extracted from scanned PDF via AI)" : "";
  return {
    ok: true,
    message: `Loaded ${rows.length} monthly P&L figures${sourceNote}.`,
    warnings: parsed.warnings,
    factsInserted: rows.length,
  };
}

// Re-run deterministic auto-classification (transfer pairs + obvious owner
// draws / loan payments) across the whole engagement. Existing classifications
// are never overwritten.
export async function runAutoClassification(
  supabase: SupabaseClient,
  engagementId: string,
  orgId: string,
): Promise<number> {
  const { data: txnRows } = await supabase
    .from("transactions")
    .select("id,account_id,txn_date,description,amount_cents,balance_cents,source_line")
    .eq("engagement_id", engagementId)
    .range(0, 20_000);
  const { data: existing } = await supabase
    .from("txn_classifications")
    .select("transaction_id")
    .eq("engagement_id", engagementId)
    .range(0, 20_000);

  const txns: BankTxn[] = ((txnRows ?? []) as TransactionRow[]).map((t) => ({
    id: t.id,
    accountId: t.account_id,
    date: t.txn_date,
    description: t.description,
    amountCents: t.amount_cents,
    balanceCents: t.balance_cents,
    sourceLine: t.source_line,
  }));
  const already = new Set((existing ?? []).map((c) => c.transaction_id as string));

  const auto = autoClassify(txns, already);
  if (auto.length === 0) return 0;

  const rows = auto.map((a) => ({
    org_id: orgId,
    engagement_id: engagementId,
    transaction_id: a.transactionId,
    class: a.cls,
    note: a.note,
    source: "auto",
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await supabase
      .from("txn_classifications")
      .upsert(rows.slice(i, i + 500), { onConflict: "transaction_id", ignoreDuplicates: true });
  }
  return rows.length;
}
