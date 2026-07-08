import type { Cents } from "./types";

// Parse a money string ("$1,234.56", "(123.45)", "-45", "1234") into integer
// cents without floating point. Returns null for blank/invalid input.
export function parseMoneyCents(raw: string | null | undefined): Cents | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === "" || s === "-" || s === "--") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0") || "0");
  return negative ? -cents : cents;
}

export function formatCents(cents: Cents, opts: { sign?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, "0");
  const body = `$${dollars.toLocaleString("en-US")}.${rem}`;
  if (negative) return `(${body})`;
  return opts.sign ? `+${body}` : body;
}

export function formatCentsShort(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.round(abs / 100);
  const body = `$${dollars.toLocaleString("en-US")}`;
  return negative ? `(${body})` : body;
}
