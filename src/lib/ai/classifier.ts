// Document classification: deterministic filename/content rules first, with an
// optional Claude API enhancement when ANTHROPIC_API_KEY is set. AI output is a
// suggestion recorded with its source; low confidence always routes to a
// one-click human confirmation in the documents table.

import type { DocType } from "../types";

export interface Classification {
  docType: DocType;
  periodStart: string | null; // YYYY-MM-DD
  periodEnd: string | null;
  accountHint: string | null;
  confidence: number; // 0..1
  source: "rules" | "ai";
}

const TYPE_RULES: Array<{ re: RegExp; type: DocType }> = [
  { re: /(balance.?sheet)/i, type: "balance_sheet" },
  { re: /(p\s*&\s*l|pnl|profit|income.?statement)/i, type: "pnl" },
  { re: /(1120|1065|1040|k-?1|tax.?return)/i, type: "tax_return" },
  { re: /(ar|receivable).{0,4}aging/i, type: "ar_aging" },
  { re: /(ap|payable).{0,4}aging/i, type: "ap_aging" },
  { re: /payroll(?!.*(account|acct))/i, type: "payroll" },
  {
    re: /(bank|statement|checking|savings|operating|chase|wells|citi|boa|amex)/i,
    type: "bank_statement",
  },
];

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function extractPeriod(name: string): { start: string | null; end: string | null } {
  // "2024-03" / "2024_03"
  let m = name.match(/(20\d{2})[-_ ](0[1-9]|1[0-2])(?!\d)/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    return {
      start: `${m[1]}-${m[2]}-01`,
      end: `${m[1]}-${m[2]}-${String(lastDayOfMonth(y, mo)).padStart(2, "0")}`,
    };
  }
  // "Mar 2024" / "march-2024"
  m = name.match(/\b([a-z]{3,9})[-_ ]?(20\d{2})/i);
  if (m) {
    const mo = MONTH_NAMES[m[1].slice(0, 3).toLowerCase()];
    if (mo) {
      const y = Number(m[2]);
      const mm = String(mo).padStart(2, "0");
      return {
        start: `${y}-${mm}-01`,
        end: `${y}-${mm}-${String(lastDayOfMonth(y, mo)).padStart(2, "0")}`,
      };
    }
  }
  // Bare year → full year
  m = name.match(/\b(20\d{2})\b/);
  if (m) return { start: `${m[1]}-01-01`, end: `${m[1]}-12-31` };
  return { start: null, end: null };
}

function extractAccountHint(name: string): string | null {
  const m = name.match(/\b(operating|payroll|savings|checking)\b[-_ ]?(\d{3,4})?/i);
  if (m) return [m[1], m[2]].filter(Boolean).join(" ");
  const digits = name.match(/[xX*•]{1,4}(\d{4})/);
  return digits ? `…${digits[1]}` : null;
}

export function classifyByRules(fileName: string, sampleText?: string): Classification {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  let docType: DocType = "unclassified";
  let typeConfidence = 0;

  if (ext === "ofx" || ext === "qfx" || ext === "qbo") {
    docType = "bank_statement";
    typeConfidence = 0.95;
  } else {
    for (const rule of TYPE_RULES) {
      if (rule.re.test(fileName)) {
        docType = rule.type;
        typeConfidence = 0.8;
        break;
      }
    }
  }

  if (docType === "unclassified" && sampleText) {
    const sample = sampleText.slice(0, 4000);
    if (/beginning balance|ending balance|deposits and credits/i.test(sample)) {
      docType = "bank_statement";
      typeConfidence = 0.6;
    } else if (/^category,/i.test(sample) || /revenue|sales/i.test(sample.split("\n")[0] ?? "")) {
      docType = "pnl";
      typeConfidence = 0.5;
    }
  }

  const period = extractPeriod(fileName);
  const confidence =
    typeConfidence === 0 ? 0.2 : period.start ? Math.min(typeConfidence + 0.15, 0.98) : typeConfidence;

  return {
    docType,
    periodStart: period.start,
    periodEnd: period.end,
    accountHint: docType === "bank_statement" ? extractAccountHint(fileName) : null,
    confidence,
    source: "rules",
  };
}

const AI_MODEL = "claude-sonnet-5";

// Optional enhancement: only called server-side when the rules are unsure and a
// key is configured. Failures fall back to the rules result — classification
// never blocks ingestion.
export async function classifyWithAI(
  fileName: string,
  sampleText: string,
  rulesResult: Classification,
): Promise<Classification> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || rulesResult.confidence >= 0.8) return rulesResult;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content:
              `Classify this financial document for M&A due diligence. Respond with ONLY a JSON object: ` +
              `{"docType": one of ["bank_statement","pnl","balance_sheet","tax_return","ar_aging","ap_aging","payroll","other"], ` +
              `"periodStart": "YYYY-MM-DD" or null, "periodEnd": "YYYY-MM-DD" or null, ` +
              `"accountHint": string or null, "confidence": 0..1}\n\n` +
              `Filename: ${fileName}\n\nFirst part of content:\n${sampleText.slice(0, 3000)}`,
          },
        ],
      }),
    });
    if (!res.ok) return rulesResult;
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!json?.docType) return rulesResult;
    return {
      docType: json.docType,
      periodStart: json.periodStart ?? null,
      periodEnd: json.periodEnd ?? null,
      accountHint: json.accountHint ?? null,
      confidence: Math.min(Number(json.confidence) || 0.5, 0.95),
      source: "ai",
    };
  } catch {
    return rulesResult;
  }
}
