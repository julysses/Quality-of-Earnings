// Deterministic fixture generator for the demo company "Bluebird HVAC LLC"
// (FY2024). Writes three CSVs plus expected.json — golden values computed
// directly from the construction arrays, independent of the engine, so tests
// prove the engine reproduces them.
//
// Designed outcomes:
//   • Proof of cash ties exactly every month on the expense side.
//   • Revenue side is flagged in exactly two months:
//       March    — $50,000 owner contribution wire (user classifies it)
//       September— $18,000 unexplained counter deposit (user acknowledges it)
//   • Inter-account transfers (operating → payroll) auto-net via pair matching.
//   • Monthly "Distribution to Member" auto-classifies as an owner draw.
//   • Add-back candidates: country club dues, personal BMW lease, one-time
//     legal settlement (June), owner comp normalization.
//
// Run: node scripts/generate-fixtures.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "fixtures");
mkdirSync(outDir, { recursive: true });

// ── Construction data (dollars) ────────────────────────────────────────────

const YEAR = 2024;
const REV = [145200, 152800, 168400, 175900, 189300, 201700, 214500, 208900, 186200, 172400, 158600, 149100];
const WAGES = [51200, 50800, 52600, 53400, 54800, 56200, 57600, 57000, 55400, 53800, 52200, 51600];
const OWNER_SALARY = 10000; // per month
const RENT = 8500;
const INSURANCE = 2100;
const FUEL = 3200; // business fuel (WEX card)
const BMW_LEASE = 1200; // personal — add-back candidate (booked under vehicle)
const CLUB = 850; // country club — add-back candidate
const LEGAL = 950;
const SETTLEMENT = 25000; // one-time, June
const ADS = 1800;
const OFFICE = 1350;
const DEPRECIATION = 3000;
const INTEREST = 1150;
const OWNER_DRAW = 4000; // per month
const OWNER_CONTRIBUTION = 50000; // March
const MYSTERY_DEPOSIT = 18000; // September

const cogs = REV.map((r) => Math.round(r * 0.38));
const settlementMonth = 5; // June (0-indexed)

const mm = (m) => String(m + 1).padStart(2, "0");
const day = (m, d) => `${YEAR}-${mm(m)}-${String(d).padStart(2, "0")}`;

// ── Bank statement CSVs ────────────────────────────────────────────────────

function toCsv(rows) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}

function buildStatement(openingBalance, txnsByMonth) {
  let balance = openingBalance;
  const rows = [["Date", "Description", "Amount", "Balance"]];
  for (let m = 0; m < 12; m++) {
    for (const [d, desc, amount] of txnsByMonth(m)) {
      balance = Math.round((balance + amount) * 100) / 100;
      rows.push([day(m, d), desc, amount.toFixed(2), balance.toFixed(2)]);
    }
  }
  return toCsv(rows);
}

const operatingTxns = (m) => {
  const rev = REV[m];
  const depositA = Math.round(rev * 0.4);
  const depositB = Math.round(rev * 0.35);
  const depositC = rev - depositA - depositB;
  const cogsA = Math.round(cogs[m] * 0.6);
  const cogsB = cogs[m] - cogsA;
  const transferOut = WAGES[m] + OWNER_SALARY;
  const txns = [
    [1, "ACH - Maple Street Properties (Rent)", -RENT],
    [3, "ACH - Ferguson Supply", -cogsA],
    [5, "Deposit - ServiceTitan Payout", depositA],
    [5, "ACH - Hartford Insurance", -INSURANCE],
    [8, "WEX Fleet Card Payment", -FUEL],
    [10, "ACH - BMW Financial Services Lease", -BMW_LEASE],
    [11, "ACH - Oakmont Country Club Dues", -CLUB],
    [12, "Check Deposit - Commercial Clients", depositB],
    ...(m === 8 ? [[12, "Counter Deposit", MYSTERY_DEPOSIT]] : []),
    [13, "Check 10" + (40 + m) + " - Reynolds LLP (Legal)", -LEGAL],
    [14, "ACH - Google Ads", -ADS],
    ...(m === 2 ? [[15, "Wire In - J Bluebird", OWNER_CONTRIBUTION]] : []),
    [15, "ACH - SaaS & Office Supplies", -OFFICE],
    [16, "Loan Interest - First National Bank", -INTEREST],
    [17, "Check 10" + (60 + m) + " - Johnstone Supply", -cogsB],
    ...(m === settlementMonth ? [[18, "Wire - Litigation Settlement - Reynolds LLP", -SETTLEMENT]] : []),
    [20, "ACH - Home Warranty Co", depositC],
    [24, "Transfer to Payroll Account x9917", -transferOut],
    [28, "Distribution to Member - J Bluebird", -OWNER_DRAW],
  ];
  return txns;
};

const payrollTxns = (m) => {
  const total = WAGES[m] + OWNER_SALARY;
  const run1 = Math.floor(total / 2);
  const run2 = total - run1;
  return [
    [10, "Payroll Run - Gusto", -run1],
    [25, "Transfer from Operating x4821", total],
    [26, "Payroll Run - Gusto", -run2],
  ];
};

writeFileSync(
  join(outDir, "Bluebird-Operating-4821-Bank-Statement-2024.csv"),
  buildStatement(85000, operatingTxns),
);
writeFileSync(
  join(outDir, "Bluebird-Payroll-Account-9917-Statement-2024.csv"),
  buildStatement(60000, payrollTxns),
);

// ── P&L CSV (rows = line items, columns = months) ──────────────────────────

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pnlRows = [
  ["Category", ...monthNames.map((n) => `${n} ${YEAR}`)],
  ["Sales", ...REV],
  ["Parts & Materials", ...cogs],
  ["Payroll Wages & Taxes", ...WAGES],
  ["Officer Compensation", ...Array(12).fill(OWNER_SALARY)],
  ["Rent", ...Array(12).fill(RENT)],
  ["Insurance", ...Array(12).fill(INSURANCE)],
  ["Fuel & Vehicle", ...Array(12).fill(FUEL + BMW_LEASE)],
  ["Dues & Subscriptions", ...Array(12).fill(CLUB)],
  ["Legal & Professional", ...Array(12).fill(LEGAL).map((v, i) => (i === settlementMonth ? v + SETTLEMENT : v))],
  ["Advertising", ...Array(12).fill(ADS)],
  ["Office & Software", ...Array(12).fill(OFFICE)],
  ["Depreciation", ...Array(12).fill(DEPRECIATION)],
  ["Interest Expense", ...Array(12).fill(INTEREST)],
];
writeFileSync(join(outDir, "Bluebird-PnL-2024.csv"), toCsv(pnlRows));

// ── Golden expected values (computed independently of the engine) ──────────

const c = (dollars) => Math.round(dollars * 100); // → cents

const months = Array.from({ length: 12 }, (_, m) => {
  const extras = (m === 2 ? OWNER_CONTRIBUTION : 0) + (m === 8 ? MYSTERY_DEPOSIT : 0);
  const bookCashExpenses =
    cogs[m] + WAGES[m] + OWNER_SALARY + RENT + INSURANCE + FUEL + BMW_LEASE + CLUB +
    LEGAL + (m === settlementMonth ? SETTLEMENT : 0) + ADS + OFFICE + INTEREST;
  return {
    month: `${YEAR}-${mm(m)}`,
    bookRevenueCents: c(REV[m]),
    revenueVarianceCents: c(extras),
    revenueFlagged: extras > 2500,
    bookCashExpensesCents: c(bookCashExpenses),
    expenseVarianceCents: 0,
    expenseFlagged: false,
  };
});

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const revenueTotal = sum(REV);
const cogsTotal = sum(cogs);
const wagesTotal = sum(WAGES);
const ownerCompTotal = OWNER_SALARY * 12;
const opexTotal =
  wagesTotal +
  (RENT + INSURANCE + FUEL + BMW_LEASE + CLUB + LEGAL + ADS + OFFICE) * 12 +
  SETTLEMENT;
const daTotal = DEPRECIATION * 12;
const interestTotal = INTEREST * 12;
const netIncome = revenueTotal - cogsTotal - opexTotal - ownerCompTotal - daTotal - interestTotal;
const ebitda = netIncome + daTotal + interestTotal;

// The four demo add-backs a user (or the demo seed) creates.
const addbacks = {
  clubDuesCents: c(CLUB * 12),
  personalLeaseCents: c(BMW_LEASE * 12),
  settlementCents: c(SETTLEMENT),
  ownerCompNormalizationCents: c(OWNER_SALARY * 12 - 90000), // market salary $90k
};

const expected = {
  company: "Bluebird HVAC LLC",
  period: { start: "2024-01", end: "2024-12" },
  months,
  flaggedMonths: ["2024-03", "2024-09"],
  autoClassifications: { transferPairs: 12, ownerDraws: 12 },
  bridge: {
    revenueCents: c(revenueTotal),
    cogsCents: c(cogsTotal),
    opexCents: c(opexTotal),
    ownerCompCents: c(ownerCompTotal),
    daCents: c(daTotal),
    interestCents: c(interestTotal),
    taxesCents: 0,
    netIncomeCents: c(netIncome),
    ebitdaCents: c(ebitda),
    adjustedEbitdaCents:
      c(ebitda) +
      addbacks.clubDuesCents +
      addbacks.personalLeaseCents +
      addbacks.settlementCents +
      addbacks.ownerCompNormalizationCents,
  },
  addbacks,
};

writeFileSync(join(outDir, "expected.json"), JSON.stringify(expected, null, 2) + "\n");

console.log("Fixtures written to", outDir);
console.log("Revenue total: $" + revenueTotal.toLocaleString());
console.log("EBITDA: $" + ebitda.toLocaleString());
console.log("Adjusted EBITDA: $" + (expected.bridge.adjustedEbitdaCents / 100).toLocaleString());
