// Design-system kit (Tailwind + tokens from globals.css). Hand-rolled — the
// shadcn registry is unreachable from the build environment, and these cover
// everything the product needs while staying consistent with the
// "institutional light" token set.

import * as React from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ── Buttons ──────────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-primary text-on-primary hover:bg-primary-hover shadow-sm disabled:opacity-50",
    secondary:
      "border border-edge-strong bg-surface text-ink hover:bg-surface-2 disabled:opacity-50",
    danger: "bg-bad text-white hover:opacity-90 disabled:opacity-50",
    ghost: "text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50",
  };
  const sizes: Record<ButtonSize, string> = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3.5 py-2 text-sm",
    lg: "px-5 py-2.5 text-sm",
  };
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

/* ── Surfaces ─────────────────────────────────────────────────────────────── */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cx(
        "rounded-xl border border-edge bg-surface",
        className,
      )}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-edge px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-5" : undefined}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-3xl">{icon}</div>}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-muted">{body}</p>}
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{children}</div>}
    </div>
  );
}

/* ── Forms ────────────────────────────────────────────────────────────────── */

const fieldClasses =
  "w-full rounded-lg border border-edge-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 " +
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldClasses, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldClasses, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "rounded-lg border border-edge-strong bg-surface px-2.5 py-2 text-sm text-ink",
        "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
        props.className,
      )}
    />
  );
}

export function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-ink">
      {children}
    </label>
  );
}

/* ── Status & metadata ────────────────────────────────────────────────────── */

type BadgeTone = "green" | "yellow" | "red" | "gray" | "blue";

export function Badge({
  tone = "gray",
  dot = false,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: React.ReactNode;
}) {
  const tones: Record<BadgeTone, string> = {
    green: "bg-good-bg text-good",
    yellow: "bg-warn-bg text-warn",
    red: "bg-bad-bg text-bad",
    gray: "bg-surface-2 text-muted",
    blue: "bg-info-bg text-primary",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
      )}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "primary" | "good";
}) {
  return (
    <div
      className={cx(
        "rounded-xl border px-5 py-4",
        tone === "primary"
          ? "border-primary/30 bg-primary text-on-primary"
          : "border-edge bg-surface",
      )}
      style={tone === "primary" ? undefined : { boxShadow: "var(--shadow-card)" }}
    >
      <p
        className={cx(
          "text-xs font-semibold tracking-wide uppercase",
          tone === "primary" ? "text-on-primary/70" : "text-muted",
        )}
      >
        {label}
      </p>
      <p
        className={cx(
          "mt-1.5 text-2xl font-bold tracking-tight tabular-nums",
          tone === "good" && "text-good",
        )}
      >
        {value}
      </p>
      {sub && (
        <p className={cx("mt-1 text-xs", tone === "primary" ? "text-on-primary/70" : "text-muted")}>
          {sub}
        </p>
      )}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cx("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div
        className={cx("h-full rounded-full transition-all", pct >= 100 ? "bg-good" : "bg-primary")}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

export function HelpTip({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <details className="group relative inline-block align-middle">
      <summary
        className="inline-flex h-4 w-4 cursor-pointer list-none items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold text-muted select-none hover:bg-edge hover:text-ink [&::-webkit-details-marker]:hidden"
        aria-label={label ?? "What does this mean?"}
      >
        ?
      </summary>
      <div className="absolute left-1/2 z-20 mt-2 w-64 -translate-x-1/2 rounded-lg border border-edge bg-surface p-3 text-left text-xs leading-relaxed font-normal text-ink shadow-lg">
        {children}
      </div>
    </details>
  );
}

/* ── Tables ───────────────────────────────────────────────────────────────── */

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cx(
        "border-b border-edge px-2.5 py-2 text-xs font-semibold tracking-wide text-muted uppercase",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cx(
        "border-b border-edge/60 px-2.5 py-2 text-ink",
        align === "right" ? "text-right tabular-nums" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ── Callouts ─────────────────────────────────────────────────────────────── */

const CALLOUT_ICONS: Record<string, React.ReactNode> = {
  info: (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
      <path d="M8 15A7 7 0 108 1a7 7 0 000 14zM7.25 7h1.5v4.5h-1.5V7zM8 4.25a.875.875 0 110 1.75.875.875 0 010-1.75z" />
    </svg>
  ),
  warn: (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
      <path d="M8.87 1.97a1 1 0 00-1.74 0L.62 13.03A1 1 0 001.5 14.5h13a1 1 0 00.87-1.47L8.87 1.97zM7.25 6h1.5v3.75h-1.5V6zM8 11a.875.875 0 110 1.75A.875.875 0 018 11z" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
      <path d="M8 15A7 7 0 108 1a7 7 0 000 14zM5.53 4.47L8 6.94l2.47-2.47 1.06 1.06L9.06 8l2.47 2.47-1.06 1.06L8 9.06l-2.47 2.47-1.06-1.06L6.94 8 4.47 5.53l1.06-1.06z" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
      <path d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.53-8.97L7 10.56 4.47 8.03l1.06-1.06L7 8.44l3.47-3.47 1.06 1.06z" />
    </svg>
  ),
};

export function Callout({
  tone,
  title,
  children,
  actions,
}: {
  tone: "info" | "warn" | "error" | "success";
  title?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const tones = {
    info: "bg-info-bg text-ink [--icon:var(--primary)]",
    warn: "bg-warn-bg text-ink [--icon:var(--warn)]",
    error: "bg-bad-bg text-ink [--icon:var(--bad)]",
    success: "bg-good-bg text-ink [--icon:var(--good)]",
  };
  return (
    <div className={cx("flex items-start gap-3 rounded-xl px-4 py-3 text-sm", tones[tone])}>
      <span className="mt-0.5" style={{ color: "var(--icon)" }}>
        {CALLOUT_ICONS[tone]}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cx(title ? "mt-0.5" : null, "leading-relaxed")}>{children}</div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
