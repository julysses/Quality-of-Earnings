// Generates small, hand-verifiable PDF fixtures (a two-page bank statement
// and a P&L) for golden-testing the PDF text-extraction parsers. Kept
// deliberately smaller than the main CSV fixtures — the point is proving the
// PDF → table-lines → rows pipeline is correct, not re-deriving a whole
// company's financials. Expected values are computed here, independent of
// the parser under test, and written alongside the PDFs.
//
// Run: node scripts/generate-pdf-fixtures.mjs

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "fixtures", "pdf");
mkdirSync(outDir, { recursive: true });

const COLS = { date: 40, desc: 120, amount: 380, balance: 470 };

async function drawTable(page, font, rows, startY) {
  let y = startY;
  for (const row of rows) {
    page.drawText(row[0], { x: COLS.date, y, size: 9, font, color: rgb(0, 0, 0) });
    page.drawText(row[1], { x: COLS.desc, y, size: 9, font, color: rgb(0, 0, 0) });
    page.drawText(row[2], { x: COLS.amount, y, size: 9, font, color: rgb(0, 0, 0) });
    if (row[3]) page.drawText(row[3], { x: COLS.balance, y, size: 9, font, color: rgb(0, 0, 0) });
    y -= 18;
  }
}

// ── Bank statement fixture (2 pages, tests page-break continuity) ──────────

const page1Rows = [
  ["02/01/2024", "Beginning Balance", "", "50000.00"],
  ["02/02/2024", "ACH - Riverside Plumbing Supply", "-4210.55", "45789.45"],
  ["02/05/2024", "Deposit - Customer Invoice 1042", "12500.00", "58289.45"],
  ["02/09/2024", "Check 1051 - Metro Insurance Co", "-1875.00", "56414.45"],
  ["02/14/2024", "(Reversal) NSF Fee Refund", "35.00", "56449.45"],
];
const page2Rows = [
  ["02/18/2024", "Deposit - Customer Invoice 1043", "9800.00", "66249.45"],
  ["02/22/2024", "ACH - Payroll Gusto Inc", "-14320.10", "51929.35"],
  ["02/26/2024", "Wire - Equipment Lease Payment", "-2100.00", "49829.35"],
  ["02/28/2024", "Deposit - Customer Invoice 1044", "7250.00", "57079.35"],
];

const bankDoc = await PDFDocument.create();
const bankFont = await bankDoc.embedFont(StandardFonts.Helvetica);
const p1 = bankDoc.addPage([612, 792]);
p1.drawText("Riverside Plumbing LLC — Operating Account — February 2024", {
  x: 40, y: 760, size: 12, font: bankFont, color: rgb(0, 0, 0),
});
p1.drawText("Date", { x: COLS.date, y: 735, size: 9, font: bankFont });
p1.drawText("Description", { x: COLS.desc, y: 735, size: 9, font: bankFont });
p1.drawText("Amount", { x: COLS.amount, y: 735, size: 9, font: bankFont });
p1.drawText("Balance", { x: COLS.balance, y: 735, size: 9, font: bankFont });
await drawTable(p1, bankFont, page1Rows, 715);

const p2 = bankDoc.addPage([612, 792]);
p2.drawText("(continued)", { x: 40, y: 760, size: 10, font: bankFont, color: rgb(0.4, 0.4, 0.4) });
await drawTable(p2, bankFont, page2Rows, 735);

writeFileSync(join(outDir, "Riverside-Plumbing-Operating-Feb2024.pdf"), await bankDoc.save());

// ── P&L fixture (3 months x 5 categories, tests month-header alignment) ────

const months = ["Jan 2024", "Feb 2024", "Mar 2024"];
const pnlRows = [
  ["Sales", "142000", "148500", "156200"],
  ["Cost of Goods Sold", "56800", "59400", "62480"],
  ["Payroll Wages & Taxes", "38500", "38500", "40200"],
  ["Officer Compensation", "9000", "9000", "9000"],
  ["Rent", "5200", "5200", "5200"],
];

const pnlDoc = await PDFDocument.create();
const pnlFont = await pnlDoc.embedFont(StandardFonts.Helvetica);
const pp = pnlDoc.addPage([612, 400]);
pp.drawText("Riverside Plumbing LLC — Profit & Loss — Q1 2024", {
  x: 40, y: 360, size: 12, font: pnlFont, color: rgb(0, 0, 0),
});
const monthX = [220, 340, 460];
pp.drawText("Category", { x: 40, y: 335, size: 9, font: pnlFont });
months.forEach((m, i) => pp.drawText(m, { x: monthX[i], y: 335, size: 9, font: pnlFont }));
let y = 315;
for (const row of pnlRows) {
  pp.drawText(row[0], { x: 40, y, size: 9, font: pnlFont });
  row.slice(1).forEach((v, i) => pp.drawText(v, { x: monthX[i], y, size: 9, font: pnlFont }));
  y -= 18;
}
writeFileSync(join(outDir, "Riverside-Plumbing-PnL-Q1-2024.pdf"), await pnlDoc.save());

// ── Expected values (computed here, independent of the parser) ─────────────

const allRows = [...page1Rows, ...page2Rows];
const bankExpected = allRows
  .filter((r) => r[2] !== "") // skip the "Beginning Balance" narrative row
  .map((r) => {
    const [m, d, y] = r[0].split("/");
    return {
      date: `${y}-${m}-${d}`,
      description: r[1],
      amountCents: Math.round(parseFloat(r[2]) * 100),
      balanceCents: Math.round(parseFloat(r[3]) * 100),
    };
  });

const pnlExpected = [];
const CATEGORY_MAP = {
  Sales: "revenue",
  "Cost of Goods Sold": "cogs",
  "Payroll Wages & Taxes": "wages",
  "Officer Compensation": "owner_comp",
  Rent: "rent",
};
const monthKeys = ["2024-01", "2024-02", "2024-03"];
for (const row of pnlRows) {
  monthKeys.forEach((month, i) => {
    pnlExpected.push({
      month,
      categoryKey: CATEGORY_MAP[row[0]],
      amountCents: Math.round(parseFloat(row[i + 1]) * 100),
    });
  });
}

writeFileSync(
  join(outDir, "expected.json"),
  JSON.stringify({ bank: bankExpected, pnl: pnlExpected }, null, 2) + "\n",
);

console.log("PDF fixtures written to", outDir);
console.log(`Bank: ${bankExpected.length} transactions, PnL: ${pnlExpected.length} facts`);
