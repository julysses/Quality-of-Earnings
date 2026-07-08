// Assembles raw engagement rows into engine inputs, runs the deterministic
// engine, and evaluates the report validation gates. Pure — usable from
// server components and tests alike.

import type {
  AccountRow,
  AdjustmentRow,
  ClassificationRow,
  DocumentRow,
  EngagementRow,
  EvidenceRow,
  FactRow,
  GateAckRow,
  TransactionRow,
} from "./db-types";
import { computeProofOfCash, type ProofOfCash } from "./engine/proof-of-cash";
import { computeBridge, scrutinyFromEvidence, type Bridge, type BridgeAdjustment } from "./engine/ebitda-bridge";
import { checkCompleteness, type CompletenessResult } from "./engine/continuity";
import type { BankTxn, Fact, TxnClass } from "./types";

export interface EngagementBundle {
  engagement: EngagementRow;
  documents: DocumentRow[];
  accounts: AccountRow[];
  transactions: TransactionRow[];
  classifications: ClassificationRow[];
  facts: FactRow[];
  adjustments: AdjustmentRow[];
  evidence: EvidenceRow[];
  gateAcks: GateAckRow[];
}

export interface Gate {
  key: string;
  label: string;
  detail: string;
  passed: boolean;
  acknowledgeable: boolean; // can be waived with a disclosed note
  acknowledged: boolean;
}

export interface Analysis {
  txns: BankTxn[];
  classMap: Map<string, TxnClass>;
  classRows: Map<string, ClassificationRow>;
  facts: Fact[];
  poc: ProofOfCash;
  completeness: CompletenessResult;
  bridge: Bridge;
  gates: Gate[];
  gatesPassed: boolean;
}

export function analyzeEngagement(bundle: EngagementBundle): Analysis {
  const { engagement } = bundle;
  const periodStart = engagement.period_start.slice(0, 7);
  const periodEnd = engagement.period_end.slice(0, 7);

  const txns: BankTxn[] = bundle.transactions.map((t) => ({
    id: t.id,
    accountId: t.account_id,
    date: t.txn_date,
    description: t.description,
    amountCents: t.amount_cents,
    balanceCents: t.balance_cents,
    sourceLine: t.source_line,
  }));

  const classMap = new Map<string, TxnClass>();
  const classRows = new Map<string, ClassificationRow>();
  for (const c of bundle.classifications) {
    classMap.set(c.transaction_id, c.class);
    classRows.set(c.transaction_id, c);
  }

  const facts: Fact[] = bundle.facts.map((f) => ({
    month: f.month.slice(0, 7),
    categoryKey: f.category_key,
    amountCents: f.amount_cents,
  }));

  const poc = computeProofOfCash(txns, classMap, facts, { periodStart, periodEnd });
  const completeness = checkCompleteness(txns, periodStart, periodEnd);

  const evidenceByAdjustment = new Map<string, EvidenceRow[]>();
  for (const e of bundle.evidence) {
    if (!evidenceByAdjustment.has(e.adjustment_id)) evidenceByAdjustment.set(e.adjustment_id, []);
    evidenceByAdjustment.get(e.adjustment_id)!.push(e);
  }
  const bridgeAdjustments: BridgeAdjustment[] = bundle.adjustments.map((a) => {
    const ev = evidenceByAdjustment.get(a.id) ?? [];
    return {
      id: a.id,
      name: a.name,
      category: a.category,
      amountCents: a.amount_cents,
      scrutiny: scrutinyFromEvidence({
        documentCount: ev.filter((e) => e.document_id).length,
        transactionCount: ev.filter((e) => e.transaction_id).length,
      }),
    };
  });
  const bridge = computeBridge(facts, bridgeAdjustments);

  const gates = evaluateGates(bundle, poc, completeness, evidenceByAdjustment);

  return {
    txns,
    classMap,
    classRows,
    facts,
    poc,
    completeness,
    bridge,
    gates,
    gatesPassed: gates.every((g) => g.passed || g.acknowledged),
  };
}

function evaluateGates(
  bundle: EngagementBundle,
  poc: ProofOfCash,
  completeness: CompletenessResult,
  evidenceByAdjustment: Map<string, EvidenceRow[]>,
): Gate[] {
  const acks = new Set(bundle.gateAcks.map((g) => g.gate_key));
  const gates: Gate[] = [];

  gates.push({
    key: "data:bank",
    label: "Bank activity ingested",
    detail:
      bundle.transactions.length > 0
        ? `${bundle.transactions.length.toLocaleString()} bank transactions across ${bundle.accounts.length} account(s)`
        : "Upload bank statements (CSV or OFX/QFX) so revenue and expenses can be verified against the bank.",
    passed: bundle.transactions.length > 0,
    acknowledgeable: false,
    acknowledged: false,
  });

  gates.push({
    key: "data:pnl",
    label: "P&L ingested",
    detail:
      bundle.facts.length > 0
        ? "Monthly P&L loaded"
        : "Upload a monthly P&L (CSV) so book earnings can be reconciled to the bank.",
    passed: bundle.facts.length > 0,
    acknowledgeable: false,
    acknowledged: false,
  });

  const completenessPassed =
    completeness.breaks.length === 0 && completeness.missingMonths.length === 0;
  gates.push({
    key: "completeness",
    label: "Statement completeness",
    detail: completenessPassed
      ? "Running balances are continuous and every month in the period has bank activity."
      : [
          completeness.breaks.length > 0
            ? `${completeness.breaks.length} balance continuity break(s) — likely missing statements or rows.`
            : null,
          completeness.missingMonths.length > 0
            ? `No bank activity in: ${completeness.missingMonths.join(", ")}.`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
    passed: completenessPassed,
    acknowledgeable: true,
    acknowledged: acks.has("completeness"),
  });

  for (const month of poc.flaggedMonths) {
    const key = `poc:${month}`;
    gates.push({
      key,
      label: `Proof of cash — ${month}`,
      detail:
        "Bank activity doesn't tie to the books this month. Classify the open items in the workbench, or acknowledge the variance with an explanation (it will be disclosed in the report).",
      passed: false,
      acknowledgeable: true,
      acknowledged: acks.has(key),
    });
  }

  const unevidenced = bundle.adjustments.filter(
    (a) => (evidenceByAdjustment.get(a.id) ?? []).length === 0,
  );
  gates.push({
    key: "evidence",
    label: "All add-backs evidenced",
    detail:
      unevidenced.length === 0
        ? bundle.adjustments.length > 0
          ? "Every adjustment links to at least one source document or transaction."
          : "No adjustments recorded yet — add them from the EBITDA bridge tab."
        : `${unevidenced.length} adjustment(s) missing evidence: ${unevidenced.map((a) => a.name).join(", ")}.`,
    passed: unevidenced.length === 0,
    acknowledgeable: false,
    acknowledged: false,
  });

  return gates;
}
