// Golden tests for PDF text-layer extraction: values in fixtures/pdf/expected.json
// are computed independently in scripts/generate-pdf-fixtures.mjs, not derived
// from the parser under test. Also proves PDF-sourced rows/facts are drop-in
// compatible with the deterministic engine (same shape CSV parsing produces).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBankPdf } from "@/lib/parsers/bank-pdf";
import { parsePnlPdf } from "@/lib/parsers/pnl-pdf";
import { computeBridge } from "@/lib/engine/ebitda-bridge";
import { checkCompleteness } from "@/lib/engine/continuity";
import type { BankTxn } from "@/lib/types";

const PDF_FIXTURES = join(__dirname, "..", "fixtures", "pdf");
const expected = JSON.parse(readFileSync(join(PDF_FIXTURES, "expected.json"), "utf8"));

function loadPdf(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(PDF_FIXTURES, name)));
}

describe("bank statement PDF extraction", () => {
  it("reproduces every transaction across a page break, in order, exactly", async () => {
    const bytes = loadPdf("Riverside-Plumbing-Operating-Feb2024.pdf");
    const result = await parseBankPdf(bytes);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(expected.bank.length);
    result.rows.forEach((row, i) => {
      const gold = expected.bank[i];
      expect(row.date).toBe(gold.date);
      expect(row.description).toBe(gold.description);
      expect(row.amountCents).toBe(gold.amountCents);
      expect(row.balanceCents).toBe(gold.balanceCents);
    });
  });

  it("is compatible with the continuity checker (balances chain correctly)", async () => {
    const bytes = loadPdf("Riverside-Plumbing-Operating-Feb2024.pdf");
    const { rows } = await parseBankPdf(bytes);
    const txns: BankTxn[] = rows.map((r, i) => ({
      id: `t${i}`,
      accountId: "operating",
      date: r.date,
      description: r.description,
      amountCents: r.amountCents,
      balanceCents: r.balanceCents,
      sourceLine: r.sourceLine,
    }));
    const result = checkCompleteness(txns, "2024-02", "2024-02");
    expect(result.breaks).toEqual([]);
  });
});

describe("P&L PDF extraction", () => {
  it("reproduces every category × month figure exactly", async () => {
    const bytes = loadPdf("Riverside-Plumbing-PnL-Q1-2024.pdf");
    const result = await parsePnlPdf(bytes);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.facts).toHaveLength(expected.pnl.length);

    const key = (f: { month: string; categoryKey: string }) => `${f.month}|${f.categoryKey}`;
    const byKey = new Map(result.facts.map((f) => [key(f), f.amountCents]));
    for (const gold of expected.pnl) {
      expect(byKey.get(key(gold))).toBe(gold.amountCents);
    }
  });

  it("feeds directly into the EBITDA bridge engine like CSV-sourced facts do", async () => {
    const bytes = loadPdf("Riverside-Plumbing-PnL-Q1-2024.pdf");
    const { facts } = await parsePnlPdf(bytes);
    const bridge = computeBridge(facts, []);

    const jan = expected.pnl.filter((f: { month: string }) => f.month === "2024-01");
    const revenueTotal = expected.pnl
      .filter((f: { categoryKey: string }) => f.categoryKey === "revenue")
      .reduce((s: number, f: { amountCents: number }) => s + f.amountCents, 0);
    expect(bridge.revenueCents).toBe(revenueTotal);
    expect(jan.length).toBeGreaterThan(0); // sanity: fixture actually has January rows
  });
});
