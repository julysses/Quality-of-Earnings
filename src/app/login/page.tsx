"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Label, Callout } from "@/components/ui";
import { Logo, LogoGlyph } from "@/components/logo";

const VALUE_PROPS: Array<[string, string]> = [
  [
    "Proof of cash lenders accept",
    "Every dollar of revenue traced to actual bank deposits, month by month.",
  ],
  [
    "Evidence-linked add-backs",
    "Each EBITDA adjustment carries documents and a rationale — nothing a credit committee can wave away.",
  ],
  [
    "A guided process, not a spreadsheet",
    "Upload documents, answer plain-English questions, get a lender-ready report.",
  ],
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage({ tone: "error", text: error.message });
      } else if (!data.session) {
        setMessage({
          tone: "info",
          text: "Check your email for a confirmation link, then sign in.",
        });
      } else {
        router.push("/dashboard");
        router.refresh();
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage({ tone: "error", text: error.message });
      } else {
        router.push("/dashboard");
        router.refresh();
        return;
      }
    }
    setBusy(false);
  }

  async function magicLink() {
    if (!email) {
      setMessage({ tone: "error", text: "Enter your email first." });
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ email });
    setMessage(
      error
        ? { tone: "error", text: error.message }
        : { tone: "info", text: "Magic link sent — check your email." },
    );
    setBusy(false);
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <section
        className="hidden flex-col justify-between p-10 text-white lg:flex"
        style={{ background: "linear-gradient(160deg, #0e2b4e 0%, #14406e 55%, #1b5185 100%)" }}
      >
        <Logo invert />
        <div className="max-w-md">
          <h1 className="text-3xl leading-tight font-bold tracking-tight">
            Quality of Earnings your buyer&apos;s lender will actually underwrite.
          </h1>
          <ul className="mt-8 space-y-5">
            {VALUE_PROPS.map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <svg viewBox="0 0 16 16" className="mt-1 h-4 w-4 shrink-0 text-emerald-300" fill="currentColor" aria-hidden>
                  <path d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.53-8.97L7 10.56 4.47 8.03l1.06-1.06L7 8.44l3.47-3.47 1.06 1.06z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-white/70">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/50">
          Deterministic analysis · Evidence on every number · Not an audit or attestation
        </p>
      </section>

      {/* Form panel */}
      <section className="flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:hidden">
            <div className="mb-2 flex justify-center">
              <LogoGlyph className="h-10 w-10" />
            </div>
            <h1 className="text-xl font-bold text-ink">QoE Lite</h1>
            <p className="mt-1 text-sm text-muted">Quality of Earnings &amp; Proof of Cash</p>
          </div>

          <h2 className="text-lg font-bold text-ink">
            {mode === "signin" ? "Welcome back" : "Create your workspace"}
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted">
            {mode === "signin"
              ? "Sign in to continue your engagements."
              : "Free to start — your first engagement takes minutes."}
          </p>

          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1 text-sm">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setMessage(null);
                }}
                className={
                  mode === m
                    ? "rounded-md bg-surface px-3 py-1.5 font-semibold text-ink shadow-sm"
                    : "rounded-md px-3 py-1.5 text-muted hover:text-ink"
                }
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>
            {message && (
              <Callout tone={message.tone === "error" ? "error" : "info"}>{message.text}</Callout>
            )}
            <Button type="submit" loading={busy} className="w-full" size="lg">
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={magicLink}
              disabled={busy}
              className="text-xs text-muted underline underline-offset-2 hover:text-ink"
            >
              Email me a magic link instead
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
