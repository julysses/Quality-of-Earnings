// EBITDA bridge waterfall — server-rendered, CSS-only. Color encodes role:
// totals (chart-total), increases (chart-up), decreases (chart-down); every
// bar is direct-labeled with its value, names sit under the baseline, and a
// native tooltip carries the full label. Palette validated per dataviz checks.

import { formatCentsShort } from "@/lib/money";
import type { Cents } from "@/lib/types";

export interface WaterfallItem {
  label: string;
  amountCents: Cents;
  kind: "total" | "delta";
}

const H = 190; // plot height in px

export function Waterfall({ items }: { items: WaterfallItem[] }) {
  // Running levels: totals reset the cumulative level, deltas float on it.
  let running = 0;
  const bars = items.map((item) => {
    if (item.kind === "total") {
      running = item.amountCents;
      return { ...item, start: 0, end: item.amountCents };
    }
    const start = running;
    running += item.amountCents;
    return { ...item, start, end: running };
  });

  const top = Math.max(1, ...bars.map((b) => Math.max(b.start, b.end)));
  const scale = (v: number) => Math.max(0, (v / top) * H);

  return (
    <figure
      role="img"
      aria-label={`EBITDA bridge: ${items
        .map((i) => `${i.label} ${formatCentsShort(i.amountCents)}`)
        .join(", ")}`}
      className="w-full overflow-x-auto"
    >
      <div className="flex min-w-fit items-end gap-3 px-2" style={{ height: H + 8 }}>
        {bars.map((b, i) => {
          const lo = Math.min(b.start, b.end);
          const hi = Math.max(b.start, b.end);
          const color =
            b.kind === "total"
              ? "var(--chart-total)"
              : b.amountCents >= 0
                ? "var(--chart-up)"
                : "var(--chart-down)";
          return (
            <div
              key={i}
              className="flex h-full min-w-16 flex-1 flex-col justify-end"
              title={`${b.label}: ${formatCentsShort(b.amountCents)}`}
            >
              <p className="mb-1 text-center text-[11px] font-semibold tabular-nums text-ink">
                {formatCentsShort(b.amountCents)}
              </p>
              <div className="relative w-full" style={{ height: H }}>
                <div
                  className="absolute right-0 left-0 mx-auto max-w-14 rounded-t-[4px]"
                  style={{
                    bottom: scale(lo),
                    height: Math.max(scale(hi) - scale(lo), 3),
                    background: color,
                    borderBottomLeftRadius: b.kind === "total" ? 0 : 4,
                    borderBottomRightRadius: b.kind === "total" ? 0 : 4,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex min-w-fit gap-3 border-t border-edge px-2 pt-1.5">
        {bars.map((b, i) => (
          <p
            key={i}
            className="min-w-16 flex-1 text-center text-[11px] leading-tight text-muted"
            title={b.label}
          >
            {b.label}
          </p>
        ))}
      </div>
      <figcaption className="mt-3 flex items-center justify-center gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-total)" }} />
          EBITDA level
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-up)" }} />
          Add-back
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-down)" }} />
          Deduction
        </span>
      </figcaption>
    </figure>
  );
}
