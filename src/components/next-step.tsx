"use client";

// Persistent "what do I do next?" banner under the stepper. Hides itself on
// the page it points at — the page's own UI takes over there.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NextAction } from "@/lib/steps";
import { Button } from "./ui";

export function NextStep({ next }: { next: NextAction }) {
  const pathname = usePathname();
  const targetPath = next.href.split("#")[0];
  if (pathname === targetPath && !next.done) return null;

  return (
    <div
      className={`no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        next.done ? "border-good/30 bg-good-bg" : "border-edge bg-info-bg"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{next.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{next.body}</p>
      </div>
      {pathname !== targetPath && (
        <Link href={next.href} className="shrink-0">
          <Button size="sm" variant={next.done ? "secondary" : "primary"} type="button">
            {next.cta} →
          </Button>
        </Link>
      )}
    </div>
  );
}
