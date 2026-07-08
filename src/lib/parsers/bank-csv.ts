// Bank statement CSV parser with header-synonym detection. Handles single
// signed Amount columns and separate Debit/Credit columns; optional running
// Balance column powers continuity checks.

import Papa from "papaparse";
import { parseMoneyCents } from "../money";
import type { Cents } from "../types";

export interface ParsedBankRow {
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: Cents; // + deposit, - disbursement
  balanceCents: Cents | null;
  sourceLine: number;
}

export interface BankCsvResult {
  rows: ParsedBankRow[];
  errors: string[];
  mapping: Record<string, string>;
}

const HEADER_SYNONYMS: Record<string, string[]> = {
  date: ["date", "txn date", "transaction date", "posting date", "posted date", "post date"],
  description: ["description", "memo", "details", "payee", "name", "transaction"],
  amount: ["amount", "transaction amount", "amt"],
  debit: ["debit", "withdrawal", "withdrawals", "money out", "debits"],
  credit: ["credit", "deposit", "deposits", "money in", "credits"],
  balance: ["balance", "running balance", "ending balance", "running bal"],
};

function findHeader(headers: string[], field: string): string | undefined {
  const wanted = HEADER_SYNONYMS[field];
  return headers.find((h) => wanted.includes(h.trim().toLowerCase()));
}

export function parseDateISO(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

export function parseBankCsv(content: string): BankCsvResult {
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });
  const errors: string[] = parsed.errors
    .filter((e) => e.code !== "TooFewFields")
    .map((e) => `Row ${e.row}: ${e.message}`);

  const headers = parsed.meta.fields ?? [];
  const dateCol = findHeader(headers, "date");
  const descCol = findHeader(headers, "description");
  const amountCol = findHeader(headers, "amount");
  const debitCol = findHeader(headers, "debit");
  const creditCol = findHeader(headers, "credit");
  const balanceCol = findHeader(headers, "balance");

  if (!dateCol || !descCol || (!amountCol && !debitCol && !creditCol)) {
    return {
      rows: [],
      errors: [
        `Could not recognize the columns in this file. Found headers: ${headers.join(", ")}. ` +
          `Expected a Date column, a Description/Memo column, and either an Amount column or Debit/Credit columns.`,
      ],
      mapping: {},
    };
  }

  const mapping: Record<string, string> = { date: dateCol, description: descCol };
  if (amountCol) mapping.amount = amountCol;
  if (debitCol) mapping.debit = debitCol;
  if (creditCol) mapping.credit = creditCol;
  if (balanceCol) mapping.balance = balanceCol;

  const rows: ParsedBankRow[] = [];
  parsed.data.forEach((row, i) => {
    const line = i + 2; // 1-based + header row
    const date = parseDateISO(row[dateCol] ?? "");
    if (!date) {
      errors.push(`Line ${line}: unrecognized date "${row[dateCol]}"`);
      return;
    }
    const description = (row[descCol] ?? "").trim() || "(no description)";

    let amount: Cents | null = null;
    if (amountCol) {
      amount = parseMoneyCents(row[amountCol]);
    }
    if (amount == null && (debitCol || creditCol)) {
      const debit = debitCol ? parseMoneyCents(row[debitCol]) : null;
      const credit = creditCol ? parseMoneyCents(row[creditCol]) : null;
      if (credit != null && credit !== 0) amount = Math.abs(credit);
      else if (debit != null && debit !== 0) amount = -Math.abs(debit);
    }
    if (amount == null) {
      errors.push(`Line ${line}: could not read an amount`);
      return;
    }

    const balance = balanceCol ? parseMoneyCents(row[balanceCol]) : null;
    rows.push({ date, description, amountCents: amount, balanceCents: balance, sourceLine: line });
  });

  return { rows, errors, mapping };
}
