// Bank statement PDF parser: reconstructs table rows from a PDF's text layer
// (see pdf-text.ts) and applies the same date/amount heuristics as the CSV
// parser. A line is a transaction row when its first token is a date; the
// last one or two numeric tokens are amount (and balance, if present) — the
// same right-anchored strategy pdf tables need since descriptions can wrap
// or tokenize inconsistently but the numeric columns stay aligned.

import { extractPdfTable } from "./pdf-text";
import { parseDateISO, type ParsedBankRow } from "./bank-csv";
import { parseMoneyCents } from "../money";

// Statements commonly open (or close) with a summary line that has a date
// and a dollar figure but is not itself a transaction.
const NON_TRANSACTION_LABEL = /^(beginning|opening|ending|closing)\s+balance$/i;

export interface BankPdfResult {
  rows: ParsedBankRow[];
  errors: string[];
  extractedTextLength: number;
}

export async function parseBankPdf(bytes: Uint8Array): Promise<BankPdfResult> {
  const { lines, totalTextLength } = await extractPdfTable(bytes);
  const rows: ParsedBankRow[] = [];
  const errors: string[] = [];

  lines.forEach((line, i) => {
    const tokens = line.tokens;
    if (tokens.length < 3) return; // not enough columns to be a transaction row

    const date = parseDateISO(tokens[0]);
    if (!date) return; // header/footer/narrative line — not a transaction

    // Find the numeric columns from the right: balance (optional) then amount.
    const numericFromEnd: number[] = [];
    for (let c = tokens.length - 1; c >= 1 && numericFromEnd.length < 2; c--) {
      const cents = parseMoneyCents(tokens[c]);
      if (cents == null) break;
      numericFromEnd.unshift(cents);
    }
    if (numericFromEnd.length === 0) {
      errors.push(`Line ${i + 1} (page ${line.page}): found a date but no amount — "${tokens.join(" | ")}"`);
      return;
    }

    const amountCents = numericFromEnd.length === 2 ? numericFromEnd[0] : numericFromEnd[0];
    const balanceCents = numericFromEnd.length === 2 ? numericFromEnd[1] : null;
    const descriptionTokenCount = tokens.length - 1 - numericFromEnd.length;
    const description = tokens.slice(1, 1 + Math.max(descriptionTokenCount, 0)).join(" ").trim() || "(no description)";

    if (NON_TRANSACTION_LABEL.test(description)) return;

    rows.push({ date, description, amountCents, balanceCents, sourceLine: i + 1 });
  });

  if (rows.length === 0) {
    errors.push(
      "No transaction rows recognized in this PDF. It may be a scanned image without a text layer, or use a layout this parser doesn't understand yet.",
    );
  }

  return { rows, errors, extractedTextLength: totalTextLength };
}
