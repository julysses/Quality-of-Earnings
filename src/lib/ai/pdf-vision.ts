// Claude vision fallback for scanned/image-only PDFs (no text layer). Mirrors
// classifier.ts's classifyWithAI gating: optional, keyed off ANTHROPIC_API_KEY,
// never blocks the pipeline, and every output is still routed through the
// same validation/human-review path as text-extracted rows. Sends the PDF
// directly to the Claude API as a document content block — no rasterization
// or canvas dependency needed, since Claude reads PDF pages (including scans)
// natively.

import { mapCategory } from "../parsers/pnl-csv";
import type { ParsedBankRow } from "../parsers/bank-csv";
import type { Fact } from "../types";

const AI_MODEL = "claude-sonnet-5";

export function isVisionFallbackEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

interface VisionExtraction {
  rows?: ParsedBankRow[];
  facts?: Fact[];
  errors: string[];
}

const BANK_PROMPT =
  'Extract every transaction from this bank statement as JSON: ' +
  '{"transactions": [{"date": "YYYY-MM-DD", "description": string, "amountCents": integer (positive for deposits/credits, negative for withdrawals/debits), "balanceCents": integer or null}]}. ' +
  "Include every transaction on every page, in order. Respond with ONLY the JSON object, no other text.";

const PNL_PROMPT =
  'Extract every line item from this profit & loss statement as JSON: ' +
  '{"rows": [{"category": string, "month": "YYYY-MM", "amountCents": positive integer}]}. ' +
  "One entry per category per month shown. Use the exact category labels from the document. Respond with ONLY the JSON object, no other text.";

export async function extractPdfViaVision(
  bytes: Uint8Array,
  fileName: string,
  docType: "bank_statement" | "pnl",
): Promise<VisionExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { errors: ["AI extraction is not configured for this deployment."] };

  const base64 = Buffer.from(bytes).toString("base64");
  const prompt = docType === "bank_statement" ? BANK_PROMPT : PNL_PROMPT;

  let text: string;
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
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      return { errors: [`AI extraction of "${fileName}" failed (HTTP ${res.status}).`] };
    }
    const data = await res.json();
    const block = (data?.content ?? []).find((b: { type: string }) => b.type === "text");
    text = block?.text ?? "";
  } catch (e) {
    return { errors: [`AI extraction of "${fileName}" failed: ${e instanceof Error ? e.message : String(e)}`] };
  }

  let json: unknown;
  try {
    json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return { errors: [`AI extraction of "${fileName}" returned an unreadable response.`] };
  }

  if (docType === "bank_statement") {
    const raw = (json as { transactions?: unknown[] })?.transactions ?? [];
    const rows: ParsedBankRow[] = raw
      .map((t, i): ParsedBankRow | null => {
        const r = t as Record<string, unknown>;
        const amount = Math.round(Number(r.amountCents));
        if (typeof r.date !== "string" || !Number.isFinite(amount)) return null;
        return {
          date: r.date,
          description: typeof r.description === "string" && r.description ? r.description : "(no description)",
          amountCents: amount,
          balanceCents: r.balanceCents != null ? Math.round(Number(r.balanceCents)) : null,
          sourceLine: i + 1,
        };
      })
      .filter((r): r is ParsedBankRow => r != null);
    return {
      rows,
      errors: rows.length === 0 ? [`AI could not find any transactions in "${fileName}".`] : [],
    };
  }

  const raw = (json as { rows?: unknown[] })?.rows ?? [];
  const facts: Fact[] = raw
    .map((r): Fact | null => {
      const row = r as Record<string, unknown>;
      const amount = Math.round(Math.abs(Number(row.amountCents)));
      if (typeof row.month !== "string" || !Number.isFinite(amount) || amount === 0) return null;
      const categoryKey = mapCategory(typeof row.category === "string" ? row.category : "") ?? "other_opex";
      return { month: row.month, categoryKey, amountCents: amount };
    })
    .filter((f): f is Fact => f != null);
  return {
    facts,
    errors: facts.length === 0 ? [`AI could not find any P&L rows in "${fileName}".`] : [],
  };
}
