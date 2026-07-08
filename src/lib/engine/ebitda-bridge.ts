// EBITDA bridge: reported net income → EBITDA → adjusted EBITDA → SDE.
// Deterministic; adjustments are user-confirmed rows with evidence.

import {
  AdjustmentCategory,
  Cents,
  Fact,
  Scrutiny,
  CATEGORY_GROUPS,
} from "../types";

export interface BridgeAdjustment {
  id: string;
  name: string;
  category: AdjustmentCategory;
  amountCents: Cents; // signed: positive increases EBITDA
  scrutiny: Scrutiny;
}

export interface BridgeTotals {
  revenueCents: Cents; // incl. other income
  cogsCents: Cents;
  opexCents: Cents; // excl. owner comp
  ownerCompCents: Cents;
  daCents: Cents;
  interestCents: Cents;
  taxesCents: Cents;
  netIncomeCents: Cents;
  ebitdaCents: Cents;
}

export interface Bridge extends BridgeTotals {
  adjustments: BridgeAdjustment[];
  adjustedEbitdaCents: Cents; // all adjustments
  adjustedEbitdaDocumentedCents: Cents; // documented evidence only
  adjustedEbitdaSupportedCents: Cents; // documented + partially supported
  sdeCents: Cents; // EBITDA + owner comp + non-owner-comp adjustments
}

export function computeBridge(
  facts: Fact[],
  adjustments: BridgeAdjustment[],
): Bridge {
  let revenue = 0,
    cogs = 0,
    opex = 0,
    ownerComp = 0,
    da = 0,
    interest = 0,
    taxes = 0;

  for (const f of facts) {
    switch (CATEGORY_GROUPS[f.categoryKey]) {
      case "revenue":
      case "other_income":
        revenue += f.amountCents;
        break;
      case "cogs":
        cogs += f.amountCents;
        break;
      case "opex":
        opex += f.amountCents;
        break;
      case "owner_comp":
        ownerComp += f.amountCents;
        break;
      case "depreciation_amortization":
        da += f.amountCents;
        break;
      case "interest":
        interest += f.amountCents;
        break;
      case "taxes":
        taxes += f.amountCents;
        break;
    }
  }

  const netIncome =
    revenue - cogs - opex - ownerComp - da - interest - taxes;
  const ebitda = netIncome + da + interest + taxes;

  const sum = (list: BridgeAdjustment[]) =>
    list.reduce((acc, a) => acc + a.amountCents, 0);

  const adjustedEbitda = ebitda + sum(adjustments);
  const documented = adjustments.filter((a) => a.scrutiny === "documented");
  const supported = adjustments.filter((a) => a.scrutiny !== "unsupported");

  // SDE adds back one owner's full compensation; owner-comp normalization
  // adjustments are excluded to avoid double counting.
  const sdeAdjustments = adjustments.filter((a) => a.category !== "owner_comp");
  const sde = ebitda + ownerComp + sum(sdeAdjustments);

  return {
    revenueCents: revenue,
    cogsCents: cogs,
    opexCents: opex,
    ownerCompCents: ownerComp,
    daCents: da,
    interestCents: interest,
    taxesCents: taxes,
    netIncomeCents: netIncome,
    ebitdaCents: ebitda,
    adjustments,
    adjustedEbitdaCents: adjustedEbitda,
    adjustedEbitdaDocumentedCents: ebitda + sum(documented),
    adjustedEbitdaSupportedCents: ebitda + sum(supported),
    sdeCents: sde,
  };
}

export function scrutinyFromEvidence(evidence: {
  documentCount: number;
  transactionCount: number;
}): Scrutiny {
  if (evidence.documentCount > 0) return "documented";
  if (evidence.transactionCount > 0) return "partially_supported";
  return "unsupported";
}
