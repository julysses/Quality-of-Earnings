// Brand mark: an ascending-bars "bridge" glyph + wordmark.

export function LogoGlyph({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--primary)" />
      <rect x="6" y="17" width="4.5" height="9" rx="1.5" fill="#ffffff" opacity="0.55" />
      <rect x="13.75" y="12" width="4.5" height="14" rx="1.5" fill="#ffffff" opacity="0.75" />
      <rect x="21.5" y="6" width="4.5" height="20" rx="1.5" fill="#ffffff" />
    </svg>
  );
}

export function Logo({
  className = "",
  invert = false,
}: {
  className?: string;
  invert?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoGlyph />
      <span
        className={`text-lg font-bold tracking-tight ${invert ? "text-white" : "text-ink"}`}
      >
        QoE&nbsp;Lite
      </span>
    </span>
  );
}
