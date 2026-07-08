// Domain types shared by the financial engine, parsers, and UI.
// All money is integer cents. Positive transaction amounts are deposits/inflows,
// negative amounts are disbursements. Financial facts (P&L) are stored as
// positive magnitudes; their meaning comes from the category group.

export type Cents = number;

export interface BankTxn {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: Cents;
  balanceCents?: Cents | null;
  sourceLine?: number | null; // original row order within the source document
}

export type TxnClass =
  | "business_revenue"
  | "business_expense"
  | "owner_contribution"
  | "owner_draw"
  | "loan_proceeds"
  | "loan_payment"
  | "transfer"
  | "personal_expense"
  | "refund"
  | "other";

export const TXN_CLASS_LABELS: Record<TxnClass, string> = {
  business_revenue: "Customer payment (revenue)",
  business_expense: "Business expense",
  owner_contribution: "Owner put money in (contribution)",
  owner_draw: "Owner took money out (draw/distribution)",
  loan_proceeds: "Loan money received",
  loan_payment: "Loan principal payment",
  transfer: "Transfer between own accounts",
  personal_expense: "Personal (non-business) expense",
  refund: "Refund received",
  other: "Other / unsure",
};

// Deposit classes that are NOT revenue for proof-of-cash purposes.
export const NON_REVENUE_DEPOSIT_CLASSES: TxnClass[] = [
  "owner_contribution",
  "loan_proceeds",
  "transfer",
  "refund",
  "other",
];

// Disbursement classes that are NOT operating expenses for proof-of-cash purposes.
// Note: personal_expense stays IN cash expenses because it is also booked as an
// expense on the P&L — it becomes an EBITDA add-back instead.
export const NON_EXPENSE_DISBURSEMENT_CLASSES: TxnClass[] = [
  "transfer",
  "owner_draw",
  "loan_payment",
  "other",
];

export type CategoryGroup =
  | "revenue"
  | "other_income"
  | "cogs"
  | "opex"
  | "owner_comp"
  | "depreciation_amortization"
  | "interest"
  | "taxes";

// Mirrors the canonical_categories table seed.
export const CATEGORY_GROUPS: Record<string, CategoryGroup> = {
  revenue: "revenue",
  other_income: "other_income",
  cogs: "cogs",
  wages: "opex",
  owner_comp: "owner_comp",
  rent: "opex",
  insurance: "opex",
  vehicle: "opex",
  professional_fees: "opex",
  marketing: "opex",
  office: "opex",
  other_opex: "opex",
  depreciation: "depreciation_amortization",
  interest: "interest",
  income_taxes: "taxes",
};

export interface Fact {
  month: string; // YYYY-MM
  categoryKey: string;
  amountCents: Cents; // positive magnitude
}

export type DocType =
  | "bank_statement"
  | "pnl"
  | "balance_sheet"
  | "tax_return"
  | "ar_aging"
  | "ap_aging"
  | "payroll"
  | "other"
  | "unclassified";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  bank_statement: "Bank statement",
  pnl: "Profit & loss",
  balance_sheet: "Balance sheet",
  tax_return: "Tax return",
  ar_aging: "AR aging",
  ap_aging: "AP aging",
  payroll: "Payroll register",
  other: "Other",
  unclassified: "Unclassified",
};

export type AdjustmentCategory =
  | "owner_comp"
  | "personal_expense"
  | "one_time"
  | "rent_normalization"
  | "pro_forma"
  | "accounting_correction"
  | "other";

export const ADJUSTMENT_CATEGORY_LABELS: Record<AdjustmentCategory, string> = {
  owner_comp: "Owner compensation normalization",
  personal_expense: "Personal / discretionary expense",
  one_time: "One-time / non-recurring item",
  rent_normalization: "Rent normalization",
  pro_forma: "Pro-forma adjustment",
  accounting_correction: "Accounting correction",
  other: "Other",
};

export type Scrutiny = "documented" | "partially_supported" | "unsupported";

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function monthsBetween(startMonth: string, endMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
