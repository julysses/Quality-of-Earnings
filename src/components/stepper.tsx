"use client";

// The guided process stepper — doubles as the engagement navigation.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Step } from "@/lib/steps";

const CHECK = (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
    <path d="M13.78 4.22a.75.75 0 010 1.06l-6.5 6.5a.75.75 0 01-1.06 0l-3-3a.75.75 0 111.06-1.06l2.47 2.47 5.97-5.97a.75.75 0 011.06 0z" />
  </svg>
);

export function Stepper({ steps }: { steps: Step[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Engagement steps" className="no-print">
      <ol className="flex flex-wrap items-stretch gap-1 rounded-xl border border-edge bg-surface p-1.5">
        {steps.map((step, i) => {
          const active =
            pathname === step.href.split("#")[0] ||
            (step.key === "upload" && pathname.endsWith("/documents"));
          const circle =
            step.state === "complete" ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-good text-white">
                {CHECK}
              </span>
            ) : step.state === "attention" ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warn text-[11px] font-bold text-white">
                {step.count}
              </span>
            ) : (
              <span
                className={
                  step.state === "current"
                    ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-on-primary"
                    : "flex h-5 w-5 items-center justify-center rounded-full border border-edge-strong text-[11px] font-semibold text-muted"
                }
              >
                {i + 1}
              </span>
            );

          return (
            <li key={step.key} className="min-w-0 flex-1">
              <Link
                href={step.href}
                title={step.hint}
                aria-current={active ? "step" : undefined}
                className={`flex h-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-surface-2 font-semibold text-ink"
                    : "text-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {circle}
                <span className="truncate">{step.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
