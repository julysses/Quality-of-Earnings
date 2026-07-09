// The guided-process engine: turns an engagement's live analysis into a
// 5-step plan (state per step + the single "what to do next" action). Pure —
// used by the engagement layout (stepper + banner), overview, and dashboard.

import type { Analysis } from "./analysis";
import type { EngagementBundle } from "./analysis";

export type StepState = "complete" | "current" | "attention" | "todo";

export interface Step {
  key: "upload" | "verify" | "poc" | "addbacks" | "dscr" | "report";
  label: string;
  href: string;
  state: StepState;
  count?: number; // open items, shown as a badge
  hint: string;
}

export interface NextAction {
  title: string;
  body: string;
  href: string;
  cta: string;
  done?: boolean; // engagement finalized — celebratory banner
}

export interface StepPlan {
  steps: Step[];
  next: NextAction;
  completedCount: number;
}

export function computeSteps(bundle: EngagementBundle, analysis: Analysis): StepPlan {
  const id = bundle.engagement.id;
  const base = `/engagements/${id}`;

  const hasBank = bundle.transactions.length > 0;
  const hasPnl = bundle.facts.length > 0;
  const needsReview = bundle.documents.filter((d) => d.status === "needs_review").length;
  const failed = bundle.documents.filter((d) => d.status === "failed").length;

  const gate = (key: string) => analysis.gates.find((g) => g.key === key);
  const completenessOk = (() => {
    const g = gate("completeness");
    return !g || g.passed || g.acknowledged;
  })();
  const openPocMonths = analysis.poc.flaggedMonths.filter((m) => {
    const g = gate(`poc:${m}`);
    return !(g && g.acknowledged);
  });
  const evidenceOk = gate("evidence")?.passed ?? true;
  const finalized = bundle.engagement.status === "finalized";

  const uploadComplete = hasBank && hasPnl;
  const verifyComplete = uploadComplete && needsReview === 0 && failed === 0 && completenessOk;
  const pocComplete = uploadComplete && openPocMonths.length === 0;
  const addbacksComplete = bundle.adjustments.length > 0 && evidenceOk;
  const dscrComplete = bundle.dealStructure != null;
  const reportComplete = finalized;

  const defs: Array<{
    key: Step["key"];
    label: string;
    href: string;
    complete: boolean;
    count: number;
    hint: string;
  }> = [
    {
      key: "upload",
      label: "Upload documents",
      href: `${base}/documents`,
      complete: uploadComplete,
      count: 0,
      hint: uploadComplete
        ? "Bank activity and monthly P&L are loaded."
        : "Drop in bank statements (CSV/OFX) and the monthly P&L (CSV).",
    },
    {
      key: "verify",
      label: "Verify data",
      href: `${base}/documents#verify`,
      complete: verifyComplete,
      count: needsReview + failed + (completenessOk ? 0 : 1),
      hint: verifyComplete
        ? "Documents confirmed; statements are complete and continuous."
        : "Confirm document types and close any completeness gaps.",
    },
    {
      key: "poc",
      label: "Proof of cash",
      href: `${base}/proof-of-cash`,
      complete: pocComplete,
      count: openPocMonths.length,
      hint: pocComplete
        ? "Every month ties to the bank (or is disclosed)."
        : "Explain the months where the bank doesn't match the books.",
    },
    {
      key: "addbacks",
      label: "Add-backs",
      href: `${base}/ebitda-bridge`,
      complete: addbacksComplete,
      count: evidenceOk ? 0 : 1,
      hint: addbacksComplete
        ? `${bundle.adjustments.length} evidence-linked adjustment(s).`
        : "Adjust EBITDA for owner and one-time items — with evidence.",
    },
    {
      key: "dscr",
      label: "Lender terms",
      href: `${base}/dscr`,
      complete: dscrComplete,
      count: 0,
      hint: dscrComplete
        ? "Deal structure entered — DSCR is shown in the report."
        : "Optional: enter the proposed deal structure to show debt service coverage.",
    },
    {
      key: "report",
      label: "Report",
      href: `${base}/report`,
      complete: reportComplete,
      count: 0,
      hint: reportComplete
        ? "Finalized — share it with buyers and lenders."
        : "Review the draft and finalize when the gates clear.",
    },
  ];

  const firstIncomplete = defs.findIndex((d) => !d.complete);
  const steps: Step[] = defs.map((d, i) => ({
    key: d.key,
    label: d.label,
    href: d.href,
    hint: d.hint,
    count: d.count || undefined,
    state: d.complete
      ? "complete"
      : i === firstIncomplete
        ? d.count > 0
          ? "attention"
          : "current"
        : "todo",
  }));

  const next = nextAction(defs, firstIncomplete, {
    needsReview,
    failed,
    completenessOk,
    openPocMonths,
    gatesPassed: analysis.gatesPassed,
  });

  return {
    steps,
    next,
    completedCount: defs.filter((d) => d.complete).length,
  };
}

function nextAction(
  defs: Array<{ key: Step["key"]; href: string }>,
  firstIncomplete: number,
  ctx: {
    needsReview: number;
    failed: number;
    completenessOk: boolean;
    openPocMonths: string[];
    gatesPassed: boolean;
  },
): NextAction {
  if (firstIncomplete === -1) {
    return {
      title: "Report finalized",
      body: "Every check passed or carries a disclosed exception. Share the report with buyers and lenders.",
      href: defs[defs.length - 1].href,
      cta: "View report",
      done: true,
    };
  }
  // Lender terms are optional — never the blocking "next" action. If it's the
  // only thing left, point straight at the report instead of nagging for it.
  if (defs[firstIncomplete].key === "dscr") {
    const reportStep = defs[defs.length - 1];
    return {
      title: "Next: review the report",
      body: "Everything required is in place. Optionally add the proposed deal structure under Lender terms to show debt service coverage — or go straight to the report.",
      href: reportStep.href,
      cta: "Open report",
    };
  }
  const step = defs[firstIncomplete];
  switch (step.key) {
    case "upload":
      return {
        title: "Next: upload the seller's documents",
        body: "Start with bank statements for every account (CSV or OFX) and the monthly P&L (CSV). Drag whole folders — everything is classified automatically.",
        href: step.href,
        cta: "Upload documents",
      };
    case "verify": {
      const bits = [
        ctx.needsReview > 0 ? `${ctx.needsReview} document(s) need a one-click type confirmation` : null,
        ctx.failed > 0 ? `${ctx.failed} file(s) failed to parse` : null,
        !ctx.completenessOk ? "statement gaps were detected" : null,
      ].filter(Boolean);
      return {
        title: "Next: verify the data",
        body: `Almost there — ${bits.join(", ")}.`,
        href: step.href,
        cta: "Review documents",
      };
    }
    case "poc":
      return {
        title: `Next: resolve ${ctx.openPocMonths.length} month(s) in the proof of cash`,
        body: `The bank doesn't tie to the books in ${ctx.openPocMonths.join(", ")}. Answer a few plain-English questions about the unmatched items — or acknowledge the variance and it will be disclosed.`,
        href: step.href,
        cta: "Open the workbench",
      };
    case "addbacks":
      return {
        title: "Next: build the EBITDA bridge",
        body: "Add the owner and one-time adjustments a buyer should see — each one needs evidence and a rationale, which is exactly what lenders will ask for.",
        href: step.href,
        cta: "Add adjustments",
      };
    case "report":
    default:
      return {
        title: ctx.gatesPassed ? "Next: finalize the report" : "Next: clear the last gates",
        body: ctx.gatesPassed
          ? "All validation gates pass. Review the draft and finalize it."
          : "A few validation gates are still open — the report page shows exactly what's left.",
        href: step.href,
        cta: "Open report",
      };
  }
}
