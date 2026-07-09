// P&L PDF parser: same table-reconstruction as bank-pdf.ts, but rows are
// line items and columns are months. The header line (the one with the most
// recognizable month tokens) pins the column count; data rows take their
// last N tokens as amounts (right-anchored, same reasoning as bank-pdf.ts)
// and everything before that as the category label.

import { extractPdfTable } from "./pdf-text";
import { parseMonthHeader, mapCategory } from "./pnl-csv";
import { parseMoneyCents } from "../money";
import type { Fact } from "../types";

export interface PnlPdfResult {
  facts: Fact[];
  warnings: string[];
  errors: string[];
  extractedTextLength: number;
}

export async function parsePnlPdf(bytes: Uint8Array): Promise<PnlPdfResult> {
  const { lines, totalTextLength } = await extractPdfTable(bytes);
  const warnings: string[] = [];
  const errors: string[] = [];

  // Find the header line: the one whose tokens include the most parseable months.
  let headerMonths: string[] = [];
  let headerLineIndex = -1;
  lines.forEach((line, i) => {
    const months = line.tokens.map(parseMonthHeader).filter((m): m is string => m != null);
    if (months.length > headerMonths.length) {
      headerMonths = months;
      headerLineIndex = i;
    }
  });

  if (headerMonths.length === 0) {
    return {
      facts: [],
      warnings,
      errors: [
        "No month columns recognized in this PDF (expected headers like \"Jan 2024\"). It may be a scanned image, or use a layout this parser doesn't understand yet.",
      ],
      extractedTextLength: totalTextLength,
    };
  }

  const totals = new Map<string, number>();
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const tokens = lines[i].tokens;
    if (tokens.length <= headerMonths.length) continue;

    const amountTokens = tokens.slice(tokens.length - headerMonths.length);
    const amounts = amountTokens.map(parseMoneyCents);
    if (amounts.some((a) => a == null)) continue; // not a data row (e.g. a subtotal/narrative line)

    const label = tokens.slice(0, tokens.length - headerMonths.length).join(" ").trim();
    if (!label || /^total/i.test(label)) continue;

    let key = mapCategory(label);
    if (!key) {
      key = "other_opex";
      warnings.push(
        `"${label}" didn't match a known category — included under Other operating expenses.`,
      );
    }
    headerMonths.forEach((month, c) => {
      const cents = amounts[c];
      if (cents == null || cents === 0) return;
      const mapKey = `${month}|${key}`;
      totals.set(mapKey, (totals.get(mapKey) ?? 0) + Math.abs(cents));
    });
  }

  const facts: Fact[] = [...totals.entries()].map(([mapKey, amountCents]) => {
    const [month, categoryKey] = mapKey.split("|");
    return { month, categoryKey, amountCents };
  });

  if (facts.length === 0) {
    errors.push("Found month headers but no recognizable data rows underneath them.");
  }

  return { facts, warnings, errors, extractedTextLength: totalTextLength };
}
