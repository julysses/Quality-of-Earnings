import type { SupabaseClient } from "@supabase/supabase-js";
import type { EngagementBundle } from "../analysis";
import type {
  AccountRow,
  AdjustmentRow,
  ClassificationRow,
  DealStructureRow,
  DocumentRow,
  EngagementRow,
  EvidenceRow,
  FactRow,
  GateAckRow,
  TransactionRow,
} from "../db-types";

const MAX_ROWS = 20_000; // walking-skeleton scale; paginate in a later slice

export async function getEngagementBundle(
  supabase: SupabaseClient,
  engagementId: string,
): Promise<EngagementBundle | null> {
  const { data: engagement } = await supabase
    .from("engagements")
    .select("*")
    .eq("id", engagementId)
    .maybeSingle<EngagementRow>();
  if (!engagement) return null;

  const [documents, accounts, transactions, classifications, facts, adjustments, evidence, gateAcks, dealStructure] =
    await Promise.all([
      supabase
        .from("documents")
        .select("*")
        .eq("engagement_id", engagementId)
        .order("created_at")
        .range(0, MAX_ROWS)
        .then((r) => (r.data ?? []) as DocumentRow[]),
      supabase
        .from("accounts")
        .select("id,name,kind")
        .eq("engagement_id", engagementId)
        .order("name")
        .then((r) => (r.data ?? []) as AccountRow[]),
      supabase
        .from("transactions")
        .select("id,account_id,document_id,txn_date,description,amount_cents,balance_cents,source_line")
        .eq("engagement_id", engagementId)
        .order("txn_date")
        .order("source_line")
        .range(0, MAX_ROWS)
        .then((r) => (r.data ?? []) as TransactionRow[]),
      supabase
        .from("txn_classifications")
        .select("transaction_id,class,note,source")
        .eq("engagement_id", engagementId)
        .range(0, MAX_ROWS)
        .then((r) => (r.data ?? []) as ClassificationRow[]),
      supabase
        .from("financial_facts")
        .select("month,category_key,amount_cents")
        .eq("engagement_id", engagementId)
        .range(0, MAX_ROWS)
        .then((r) => (r.data ?? []) as FactRow[]),
      supabase
        .from("adjustments")
        .select("id,name,category,rationale,amount_cents,created_at")
        .eq("engagement_id", engagementId)
        .order("created_at")
        .then((r) => (r.data ?? []) as AdjustmentRow[]),
      supabase
        .from("adjustment_evidence")
        .select("id,adjustment_id,document_id,transaction_id,note")
        .in(
          "adjustment_id",
          (
            await supabase.from("adjustments").select("id").eq("engagement_id", engagementId)
          ).data?.map((a) => a.id) ?? ["00000000-0000-0000-0000-000000000000"],
        )
        .then((r) => (r.data ?? []) as EvidenceRow[]),
      supabase
        .from("gate_acknowledgements")
        .select("gate_key,note")
        .eq("engagement_id", engagementId)
        .then((r) => (r.data ?? []) as GateAckRow[]),
      supabase
        .from("deal_structures")
        .select(
          "id,purchase_price_cents,equity_injection_cents,senior_debt_cents,senior_rate_bps,senior_term_months," +
            "seller_note_cents,seller_note_rate_bps,seller_note_term_months,seller_note_io_months," +
            "existing_debt_cents,existing_debt_rate_bps,existing_debt_term_months",
        )
        .eq("engagement_id", engagementId)
        .maybeSingle()
        .then((r) => (r.data ?? null) as DealStructureRow | null),
    ]);

  return {
    engagement,
    documents,
    accounts,
    transactions,
    classifications,
    facts,
    adjustments,
    evidence,
    gateAcks,
    dealStructure,
  };
}
