"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TabNav({ base, tabs }: { base: string; tabs: Array<[string, string]> }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
      {tabs.map(([suffix, label]) => {
        const href = `${base}${suffix}`;
        const active = suffix === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={
              active
                ? "-mb-px border-b-2 border-slate-900 px-3 py-2 text-sm font-medium dark:border-slate-100"
                : "px-3 py-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
