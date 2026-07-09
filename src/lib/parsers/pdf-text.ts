// Shared PDF → table-lines reconstruction. Uses pdfjs-dist's text layer
// (position + width per text run) rather than its own synthesized spacing,
// so column gaps can be measured and turned into explicit multi-space
// separators — letting bank/P&L PDF parsers tokenize columns the same way
// a fixed-width text table would be read.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface PdfLine {
  page: number;
  tokens: string[]; // column tokens, left to right
}

export interface PdfExtraction {
  lines: PdfLine[];
  totalTextLength: number; // used to detect scanned/image-only PDFs
}

interface RawItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

const COLUMN_GAP_MULTIPLIER = 4; // gap > this many avg-char-widths = new column
const WORD_GAP_MULTIPLIER = 0.6; // gap > this many avg-char-widths = word space

export async function extractPdfTable(bytes: Uint8Array): Promise<PdfExtraction> {
  const pdf = await getDocument({
    data: bytes,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const lines: PdfLine[] = [];
  let totalTextLength = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const items: RawItem[] = [];
    for (const raw of content.items as Array<{ str: string; transform: number[]; width: number }>) {
      if (!raw.str || raw.str.trim() === "") continue;
      items.push({
        str: raw.str,
        x: raw.transform[4],
        y: raw.transform[5],
        width: raw.width,
        fontSize: Math.abs(raw.transform[3]) || 10,
      });
      totalTextLength += raw.str.length;
    }

    // Group into lines by y-position (2pt tolerance for baseline jitter).
    const byLine = new Map<number, RawItem[]>();
    for (const item of items) {
      const key = Math.round(item.y / 2) * 2;
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key)!.push(item);
    }

    const sortedYs = [...byLine.keys()].sort((a, b) => b - a); // top of page first
    for (const y of sortedYs) {
      const lineItems = byLine.get(y)!.sort((a, b) => a.x - b.x);
      const tokens = reconstructColumns(lineItems);
      if (tokens.length > 0) lines.push({ page: pageNum, tokens });
    }
  }

  return { lines, totalTextLength };
}

function reconstructColumns(items: RawItem[]): string[] {
  const tokens: string[] = [];
  let current = "";
  let prevEndX: number | null = null;

  for (const item of items) {
    const avgCharWidth = Math.max(item.fontSize * 0.5, 3);
    if (prevEndX != null) {
      const gap = item.x - prevEndX;
      if (gap > avgCharWidth * COLUMN_GAP_MULTIPLIER) {
        if (current) tokens.push(current.trim());
        current = "";
      } else if (gap > avgCharWidth * WORD_GAP_MULTIPLIER) {
        current += " ";
      }
    }
    current += item.str;
    prevEndX = item.x + (item.width || item.str.length * avgCharWidth);
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}
