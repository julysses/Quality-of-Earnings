// Minimal OFX/QFX parser: extracts <STMTTRN> transaction blocks from either
// SGML (unclosed tags) or XML flavors.

import type { Cents } from "../types";
import type { ParsedBankRow } from "./bank-csv";

export interface OfxResult {
  rows: ParsedBankRow[];
  errors: string[];
}

function tagValue(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : null;
}

function parseOfxAmount(raw: string): Cents | null {
  if (!/^[-+]?\d+(\.\d{1,2})?$/.test(raw)) return null;
  const negative = raw.startsWith("-");
  const s = raw.replace(/^[-+]/, "");
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0") || "0");
  return negative ? -cents : cents;
}

export function parseOfx(content: string): OfxResult {
  const rows: ParsedBankRow[] = [];
  const errors: string[] = [];
  const blocks = content.split(/<STMTTRN>/i).slice(1);

  blocks.forEach((rawBlock, i) => {
    const block = rawBlock.split(/<\/STMTTRN>/i)[0];
    const dt = tagValue(block, "DTPOSTED");
    const amt = tagValue(block, "TRNAMT");
    const name = tagValue(block, "NAME");
    const memo = tagValue(block, "MEMO");

    if (!dt || !amt) {
      errors.push(`Transaction ${i + 1}: missing DTPOSTED or TRNAMT`);
      return;
    }
    const dm = dt.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!dm) {
      errors.push(`Transaction ${i + 1}: unrecognized date "${dt}"`);
      return;
    }
    const amount = parseOfxAmount(amt);
    if (amount == null) {
      errors.push(`Transaction ${i + 1}: unrecognized amount "${amt}"`);
      return;
    }
    rows.push({
      date: `${dm[1]}-${dm[2]}-${dm[3]}`,
      description: [name, memo].filter(Boolean).join(" — ") || "(no description)",
      amountCents: amount,
      balanceCents: null,
      sourceLine: i + 1,
    });
  });

  return { rows, errors };
}
