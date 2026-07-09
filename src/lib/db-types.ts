// Hand-written row types for the tables the app reads. Kept minimal on
// purpose — regenerate with `supabase gen types` once the schema stabilizes.

import type {
  AdjustmentCategory,
  DocType,
  TxnClass,
} from "./types";

export interface EngagementRow {
  id: string;
  org_id: string;
  name: string;
  entity_name: string;
  period_start: string; // YYYY-MM-DD
  period_end: string;
  status: "active" | "finalized" | "archived";
  is_demo: boolean;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  org_id: string;
  engagement_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  doc_type: DocType;
  period_start: string | null;
  period_end: string | null;
  account_hint: string | null;
  classification_confidence: number | null;
  classification_source: "rules" | "ai" | "user" | null;
  status: "uploaded" | "needs_review" | "confirmed" | "parsed" | "failed" | "unsupported";
  parse_error: string | null;
  created_at: string;
}

export interface AccountRow {
  id: string;
  name: string;
  kind: "bank" | "credit_card";
}

export interface TransactionRow {
  id: string;
  account_id: string;
  document_id: string | null;
  txn_date: string;
  description: string;
  amount_cents: number;
  balance_cents: number | null;
  source_line: number | null;
}

export interface FactRow {
  month: string; // YYYY-MM-DD (first of month)
  category_key: string;
  amount_cents: number;
}

export interface ClassificationRow {
  transaction_id: string;
  class: TxnClass;
  note: string | null;
  source: "auto" | "user" | "ai";
}

export interface AdjustmentRow {
  id: string;
  name: string;
  category: AdjustmentCategory;
  rationale: string;
  amount_cents: number;
  created_at: string;
}

export interface EvidenceRow {
  id: string;
  adjustment_id: string;
  document_id: string | null;
  transaction_id: string | null;
  note: string | null;
}

export interface GateAckRow {
  gate_key: string;
  note: string;
}

export interface DealStructureRow {
  id: string;
  purchase_price_cents: number;
  equity_injection_cents: number;
  senior_debt_cents: number;
  senior_rate_bps: number;
  senior_term_months: number;
  seller_note_cents: number;
  seller_note_rate_bps: number;
  seller_note_term_months: number;
  seller_note_io_months: number;
  existing_debt_cents: number;
  existing_debt_rate_bps: number;
  existing_debt_term_months: number;
}
