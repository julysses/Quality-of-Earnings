"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input, Label, Callout } from "@/components/ui";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">QoE Lite</h1>
        <p className="mt-1 text-sm text-slate-500">
          Quality of Earnings &amp; Proof of Cash for SMB deals
        </p>
      </div>
      <Card>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 text-sm dark:bg-slate-800">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                mode === m
                  ? "rounded bg-white px-3 py-1.5 font-medium shadow-sm dark:bg-slate-700"
                  : "rounded px-3 py-1.5 text-slate-500"
              }
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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
            />
          </div>
          {message && (
            <Callout tone={message.tone === "error" ? "error" : "info"}>{message.text}</Callout>
          )}
          <Button type="submit" disabled={busy} className="w-full justify-center">
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={magicLink}
            disabled={busy}
            className="text-xs text-slate-500 underline hover:text-slate-700"
          >
            Email me a magic link instead
          </button>
        </div>
      </Card>
    </main>
  );
}
