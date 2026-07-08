// P&L CSV parser: rows are line items, columns are months
// (e.g. "Category,Jan 2024,Feb 2024,..."). Line items map to canonical
// categories via a synonym table; unmapped rows land in other_opex with a
// warning the UI surfaces (the app never silently guesses without telling).

import Papa from "papaparse";
import { parseMoneyCents } from "../money";
import type { Fact } from "../types";

export interface PnlCsvResult {
  facts: Fact[];
  warnings: string[];
  errors: string[];
}

const MONTHS: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07",
  july: "07", aug: "08", august: "08", sep: "09", sept: "09", september: "09",
  oct: "10", october: "10", nov: "11", november: "11", dec: "12", december: "12",
};

export function parseMonthHeader(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^([a-z]+)[ .\-]*'?(\d{2,4})$/);
  if (m && MONTHS[m[1]]) {
    const year = m[2].length === 2 ? `20${m[2]}` : m[2];
    return `${year}-${MONTHS[m[1]]}`;
  }
  return null;
}

// Ordered: first match wins (so "auto lease" hits vehicle before rent's "lease").
const CATEGORY_SYNONYMS: Array<{ re: RegExp; key: string }> = [
  { re: /(officer|owner).*(comp|salary|wage)/i, key: "owner_comp" },
  { re: /(depreciation|amortization)/i, key: "depreciation" },
  { re: /interest/i, key: "interest" },
  { re: /income tax/i, key: "income_taxes" },
  { re: /(cogs|cost of (goods|sales)|materials|parts|subcontract)/i, key: "cogs" },
  { re: /(payroll|wages|salaries|staff comp)/i, key: "wages" },
  { re: /(auto|vehicle|fuel|truck)/i, key: "vehicle" },
  { re: /(rent|occupancy|lease)/i, key: "rent" },
  { re: /insurance/i, key: "insurance" },
  { re: /(legal|professional|accounting)/i, key: "professional_fees" },
  { re: /(advertis|marketing)/i, key: "marketing" },
  { re: /(office|software|supplies|subscriptions?|dues)/i, key: "office" },
  { re: /(other income|misc income)/i, key: "other_income" },
  { re: /(sales|revenue|income)/i, key: "revenue" },
];

export function mapCategory(label: string): string | null {
  for (const { re, key } of CATEGORY_SYNONYMS) {
    if (re.test(label)) return key;
  }
  return null;
}

export function parsePnlCsv(content: string): PnlCsvResult {
  const parsed = Papa.parse<string[]>(content, { skipEmptyLines: true });
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows = parsed.data;
  if (rows.length < 2) {
    return { facts: [], warnings, errors: ["File appears to be empty."] };
  }

  const header = rows[0];
  const monthCols: Array<{ index: number; month: string }> = [];
  header.slice(1).forEach((h, i) => {
    const month = parseMonthHeader(h);
    if (month) monthCols.push({ index: i + 1, month });
  });
  if (monthCols.length === 0) {
    return {
      facts: [],
      warnings,
      errors: [
        `No month columns recognized in header: ${header.join(", ")}. ` +
          `Expected columns like "Jan 2024" or "2024-01" after the first (category) column.`,
      ],
    };
  }

  // Aggregate per (month, category) — several source rows may map to one key.
  const totals = new Map<string, number>();
  for (let r = 1; r < rows.length; r++) {
    const label = (rows[r][0] ?? "").trim();
    if (!label || /^total/i.test(label)) continue; // skip blank + subtotal rows
    let key = mapCategory(label);
    if (!key) {
      key = "other_opex";
      warnings.push(
        `"${label}" didn't match a known category — included under Other operating expenses. ` +
          `Rename the row (e.g. "Rent", "Insurance", "Advertising") if that's wrong.`,
      );
    }
    for (const { index, month } of monthCols) {
      const cents = parseMoneyCents(rows[r][index]);
      if (cents == null || cents === 0) continue;
      const mapKey = `${month}|${key}`;
      totals.set(mapKey, (totals.get(mapKey) ?? 0) + Math.abs(cents));
    }
  }

  const facts: Fact[] = [...totals.entries()].map(([mapKey, amountCents]) => {
    const [month, categoryKey] = mapKey.split("|");
    return { month, categoryKey, amountCents };
  });

  return { facts, warnings, errors };
}
