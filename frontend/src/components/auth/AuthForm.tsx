"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/auth/client";
import { isAuthConfigured } from "@/lib/auth/config";
import { safeRedirectPath } from "@/lib/auth/redirect";

function friendlyError(message: string): string {
  const value = message.toLowerCase();
  if (value.includes("already") || value.includes("registered")) return "You already have an account. Log in and we will attach your current analysis to it.";
  if (value.includes("password") || value.includes("credentials")) return "That password does not match. Try again or request a reset link.";
  if (value.includes("rate")) return "Too many attempts. Wait a moment, then try again.";
  return "We could not complete that request. Check your connection and try again.";
}

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeRedirectPath(params.get("next") ?? (mode === "register" ? "/" : undefined));
  const conversion = params.get("from") === "results" || params.get("from") === "pipeline";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") === "auth_callback" ? "That sign-in link has expired or could not be used. Request a fresh link and try again." : null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const client = createClient();
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const result = mode === "login"
      ? await client.auth.signInWithPassword({ email, password })
      : await client.auth.signUp({ email, password, options: { emailRedirectTo: callback } });
    setLoading(false);

    if (result.error) {
      setError(friendlyError(result.error.message));
      return;
    }
    if (mode === "register" && !result.data.session) {
      router.push(`/signup/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
      return;
    }
    if (conversion) {
      router.push(`/signup/finishing?next=${encodeURIComponent(next)}`);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function oauth(provider: "google" | "apple") {
    setError(null);
    const { error: providerError } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (providerError) setError("The connection was cancelled or timed out. Nothing was lost, your analysis is still here.");
  }

  if (!isAuthConfigured()) {
    return <p role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning-text">Authentication is unavailable right now. Your guest analysis is still safe on this device.</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <div className="flex gap-2.5">
        <button type="button" onClick={() => oauth("google")} className="ns-btn flex-1 rounded-xl border border-border-strong bg-surface-elevated p-3.5 text-sm font-bold hover:bg-[#24222F]">Google</button>
        <button type="button" onClick={() => oauth("apple")} className="ns-btn flex-1 rounded-xl border border-border-strong bg-surface-elevated p-3.5 text-sm font-bold hover:bg-[#24222F]">Apple</button>
      </div>
      <div className="flex items-center gap-3 text-xs font-semibold text-muted"><i className="h-px flex-1 bg-border" />or<i className="h-px flex-1 bg-border" /></div>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-foreground-secondary">
        Email
        <Input placeholder="you@band.com" error={Boolean(error)} type="email" autoComplete="email" required value={email} onChange={(event) => { setEmail(event.target.value); setError(null); }} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-foreground-secondary">
        <span className="flex justify-between">Password{mode === "login" && <Link href={`/forgot-password?next=${encodeURIComponent(next)}`} className="text-accent-text">Forgot?</Link>}</span>
        <Input placeholder={mode === "login" ? "Your password" : "At least 8 characters"} error={Boolean(error)} type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required value={password} onChange={(event) => { setPassword(event.target.value); setError(null); }} />
      </label>
      {error && <p role="alert" className="text-[13px] font-semibold text-warning-text">{error}</p>}
      <Button type="submit" variant="gradient" disabled={loading} className="py-[15px]">{loading ? "Please wait…" : mode === "login" ? "Continue" : conversion ? "Create account and save" : "Create account"}</Button>
      <p className="text-xs leading-relaxed text-muted">By continuing, you agree to NextStage&apos;s terms and privacy policy.</p>
      <div className="mt-1 flex flex-col gap-2.5 border-t border-border pt-5 text-sm font-semibold text-foreground-muted">
        <p>{mode === "login" ? "New here? " : "Already have an account? "}<Link className="text-accent-text" href={`/${mode === "login" ? "signup" : "login"}?next=${encodeURIComponent(next)}${conversion ? "&from=results" : ""}`}>{mode === "login" ? "Create an account" : "Log in"}</Link></p>
        <p>{mode === "login" ? <>Or <Link href="/" className="text-accent-text">try NextStage without an account</Link></> : <>Rather see it first? <Link href="/" className="text-accent-text">Run an analysis without an account</Link></>}</p>
      </div>
    </form>
  );
}
