// Golden-file tests: the fixture generator computes expected values directly
// from its construction arrays; these tests prove that parsers + engine
// reproduce them end-to-end.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBankCsv } from "@/lib/parsers/bank-csv";
import { parsePnlCsv } from "@/lib/parsers/pnl-csv";
import { parseOfx } from "@/lib/parsers/ofx";
import { autoClassify } from "@/lib/engine/auto-classify";
import { computeProofOfCash } from "@/lib/engine/proof-of-cash";
import { computeBridge, scrutinyFromEvidence } from "@/lib/engine/ebitda-bridge";
import { checkCompleteness } from "@/lib/engine/continuity";
import { classifyByRules, isQuickBooksDesktopFile } from "@/lib/ai/classifier";
import { parseMoneyCents, formatCents } from "@/lib/money";
import type { BankTxn, TxnClass } from "@/lib/types";

const FIXTURES = join(__dirname, "..", "fixtures");
const read = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const expected = JSON.parse(read("expected.json"));

function loadTxns(): BankTxn[] {
  const files: Array<[string, string]> = [
    ["operating", "Bluebird-Operating-4821-Bank-Statement-2024.csv"],
    ["payroll", "Bluebird-Payroll-Account-9917-Statement-2024.csv"],
  ];
  const txns: BankTxn[] = [];
  for (const [accountId, file] of files) {
    const result = parseBankCsv(read(file));
    expect(result.errors).toEqual([]);
    result.rows.forEach((row, i) => {
      txns.push({
        id: `${accountId}-${i}`,
        accountId,
        date: row.date,
        description: row.description,
        amountCents: row.amountCents,
        balanceCents: row.balanceCents,
        sourceLine: row.sourceLine,
      });
    });
  }
  return txns;
}

describe("money", () => {
  it("parses money strings without floating point error", () => {
    expect(parseMoneyCents("$1,234.56")).toBe(123456);
    expect(parseMoneyCents("(123.45)")).toBe(-12345);
    expect(parseMoneyCents("-45")).toBe(-4500);
    expect(parseMoneyCents("0.1")).toBe(10);
    expect(parseMoneyCents("19.99")).toBe(1999);
    expect(parseMoneyCents("")).toBeNull();
    expect(parseMoneyCents("abc")).toBeNull();
  });
  it("formats cents", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(-9900)).toBe("($99.00)");
  });
});

describe("parsers", () => {
  it("parses both bank statements with balances", () => {
    const txns = loadTxns();
    expect(txns.length).toBeGreaterThan(200);
    expect(txns.every((t) => t.balanceCents != null)).toBe(true);
  });

  it("parses the P&L into canonical facts without errors", () => {
    const result = parsePnlCsv(read("Bluebird-PnL-2024.csv"));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]); // every fixture row maps to a category
    const keys = new Set(result.facts.map((f) => f.categoryKey));
    expect(keys).toContain("revenue");
    expect(keys).toContain("cogs");
    expect(keys).toContain("owner_comp");
    expect(keys).toContain("depreciation");
  });

  it("parses OFX transaction blocks", () => {
    const ofx = `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20240115120000<TRNAMT>1500.25<FITID>1<NAME>Customer payment</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20240116<TRNAMT>-42.10<FITID>2<NAME>Fuel<MEMO>Shell</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const result = parseOfx(ofx);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ date: "2024-01-15", amountCents: 150025 });
    expect(result.rows[1]).toMatchObject({ date: "2024-01-16", amountCents: -4210 });
  });
});

describe("classifier rules", () => {
  it("classifies the fixture filenames", () => {
    const op = classifyByRules("Bluebird-Operating-4821-Bank-Statement-2024.csv");
    expect(op.docType).toBe("bank_statement");
    expect(op.periodStart).toBe("2024-01-01");
    expect(op.periodEnd).toBe("2024-12-31");

    const payroll = classifyByRules("Bluebird-Payroll-Account-9917-Statement-2024.csv");
    expect(payroll.docType).toBe("bank_statement");

    const pnl = classifyByRules("Bluebird-PnL-2024.csv");
    expect(pnl.docType).toBe("pnl");

    expect(classifyByRules("export.qfx").docType).toBe("bank_statement");
    expect(classifyByRules("randomfile.bin").docType).toBe("unclassified");
  });
});

describe("QuickBooks Desktop file detection", () => {
  it("flags QuickBooks Desktop file extensions", () => {
    expect(isQuickBooksDesktopFile("Company Backup.QBB")).toBe(true);
    expect(isQuickBooksDesktopFile("acme.qbw")).toBe(true);
    expect(isQuickBooksDesktopFile("acme.qbm")).toBe(true);
    expect(isQuickBooksDesktopFile("accountants-copy.qbx")).toBe(true);
    expect(isQuickBooksDesktopFile("accountants-copy.qba")).toBe(true);
  });

  it("does not flag the unrelated .qbo bank-download format", () => {
    // .qbo is Quicken/QuickBooks' OFX-style bank-transaction-download format,
    // handled by the OFX parser — a completely different, readable format
    // that happens to share Intuit's naming, not a QuickBooks company file.
    expect(isQuickBooksDesktopFile("chase-download.qbo")).toBe(false);
  });

  it("does not flag ordinary supported formats", () => {
    expect(isQuickBooksDesktopFile("statement.csv")).toBe(false);
    expect(isQuickBooksDesktopFile("statement.ofx")).toBe(false);
    expect(isQuickBooksDesktopFile("statement.pdf")).toBe(false);
    expect(isQuickBooksDesktopFile("noextension")).toBe(false);
  });
});

describe("continuity", () => {
  it("finds no breaks or missing months in the clean fixture", () => {
    const result = checkCompleteness(loadTxns(), "2024-01", "2024-12");
    expect(result.breaks).toEqual([]);
    expect(result.missingMonths).toEqual([]);
  });

  it("detects a balance break when a transaction is removed", () => {
    const txns = loadTxns().filter((t) => !(t.accountId === "operating" && t.description.includes("WEX") && t.date.startsWith("2024-05")));
    const result = checkCompleteness(txns, "2024-01", "2024-12");
    expect(result.breaks.length).toBeGreaterThan(0);
  });

  it("detects missing months", () => {
    const txns = loadTxns().filter((t) => !t.date.startsWith("2024-07"));
    const result = checkCompleteness(txns, "2024-01", "2024-12");
    expect(result.missingMonths).toEqual(["2024-07"]);
  });
});

describe("auto-classification", () => {
  it("detects all transfer pairs and owner draws, never deposits-as-non-revenue", () => {
    const txns = loadTxns();
    const auto = autoClassify(txns, new Set());
    const transfers = auto.filter((a) => a.cls === "transfer");
    const draws = auto.filter((a) => a.cls === "owner_draw");
    expect(transfers).toHaveLength(expected.autoClassifications.transferPairs * 2);
    expect(draws).toHaveLength(expected.autoClassifications.ownerDraws);

    // The March owner contribution and September mystery deposit must remain
    // unclassified — deposits are never auto-classified as non-revenue.
    const byId = new Map(txns.map((t) => [t.id, t]));
    for (const a of auto) {
      const t = byId.get(a.transactionId)!;
      if (t.amountCents > 0) expect(a.cls).toBe("transfer");
    }
  });
});

describe("proof of cash (golden)", () => {
  function run() {
    const txns = loadTxns();
    const auto = autoClassify(txns, new Set());
    const classifications = new Map<string, TxnClass>(
      auto.map((a) => [a.transactionId, a.cls]),
    );
    const pnl = parsePnlCsv(read("Bluebird-PnL-2024.csv"));
    return computeProofOfCash(txns, classifications, pnl.facts, {
      periodStart: "2024-01",
      periodEnd: "2024-12",
    });
  }

  it("matches the golden monthly variances exactly", () => {
    const poc = run();
    expect(poc.months).toHaveLength(12);
    for (let i = 0; i < 12; i++) {
      const gold = expected.months[i];
      const month = poc.months[i];
      expect(month.month).toBe(gold.month);
      expect(month.revenue.bookCents).toBe(gold.bookRevenueCents);
      expect(month.revenue.varianceCents).toBe(gold.revenueVarianceCents);
      expect(month.revenue.flagged).toBe(gold.revenueFlagged);
      expect(month.expense.bookCents).toBe(gold.bookCashExpensesCents);
      expect(month.expense.varianceCents).toBe(gold.expenseVarianceCents);
      expect(month.expense.flagged).toBe(gold.expenseFlagged);
    }
    expect(poc.flaggedMonths).toEqual(expected.flaggedMonths);
  });

  it("clears the March flag once the owner contribution is classified", () => {
    const txns = loadTxns();
    const auto = autoClassify(txns, new Set());
    const classifications = new Map<string, TxnClass>(
      auto.map((a) => [a.transactionId, a.cls]),
    );
    const contribution = txns.find((t) => t.description.includes("Wire In - J Bluebird"))!;
    classifications.set(contribution.id, "owner_contribution");
    const pnl = parsePnlCsv(read("Bluebird-PnL-2024.csv"));
    const poc = computeProofOfCash(txns, classifications, pnl.facts, {
      periodStart: "2024-01",
      periodEnd: "2024-12",
    });
    expect(poc.flaggedMonths).toEqual(["2024-09"]);
  });
});

describe("EBITDA bridge (golden)", () => {
  it("matches the golden bridge including all four demo add-backs", () => {
    const pnl = parsePnlCsv(read("Bluebird-PnL-2024.csv"));
    const bridge = computeBridge(pnl.facts, [
      { id: "1", name: "Country club dues", category: "personal_expense", amountCents: expected.addbacks.clubDuesCents, scrutiny: "documented" },
      { id: "2", name: "Personal vehicle lease", category: "personal_expense", amountCents: expected.addbacks.personalLeaseCents, scrutiny: "partially_supported" },
      { id: "3", name: "Litigation settlement", category: "one_time", amountCents: expected.addbacks.settlementCents, scrutiny: "documented" },
      { id: "4", name: "Owner comp normalization to market", category: "owner_comp", amountCents: expected.addbacks.ownerCompNormalizationCents, scrutiny: "documented" },
    ]);

    expect(bridge.revenueCents).toBe(expected.bridge.revenueCents);
    expect(bridge.cogsCents).toBe(expected.bridge.cogsCents);
    expect(bridge.ownerCompCents).toBe(expected.bridge.ownerCompCents);
    expect(bridge.daCents).toBe(expected.bridge.daCents);
    expect(bridge.interestCents).toBe(expected.bridge.interestCents);
    expect(bridge.netIncomeCents).toBe(expected.bridge.netIncomeCents);
    expect(bridge.ebitdaCents).toBe(expected.bridge.ebitdaCents);
    expect(bridge.adjustedEbitdaCents).toBe(expected.bridge.adjustedEbitdaCents);

    // Conservatism tiers: documented-only excludes the partially-supported lease.
    expect(bridge.adjustedEbitdaDocumentedCents).toBe(
      expected.bridge.adjustedEbitdaCents - expected.addbacks.personalLeaseCents,
    );
    expect(bridge.adjustedEbitdaSupportedCents).toBe(expected.bridge.adjustedEbitdaCents);

    // SDE: EBITDA + owner comp + non-owner-comp add-backs (no double count).
    expect(bridge.sdeCents).toBe(
      expected.bridge.ebitdaCents +
        expected.bridge.ownerCompCents +
        expected.addbacks.clubDuesCents +
        expected.addbacks.personalLeaseCents +
        expected.addbacks.settlementCents,
    );
  });

  it("computes scrutiny from evidence", () => {
    expect(scrutinyFromEvidence({ documentCount: 1, transactionCount: 0 })).toBe("documented");
    expect(scrutinyFromEvidence({ documentCount: 0, transactionCount: 3 })).toBe("partially_supported");
    expect(scrutinyFromEvidence({ documentCount: 0, transactionCount: 0 })).toBe("unsupported");
  });
});
