"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/auth/client";
import { isAuthConfigured } from "@/lib/auth/config";
import { safeRedirectPath } from "@/lib/auth/redirect";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRedirectPath(searchParams.get("next"));
  const configured = isAuthConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    const client = createClient();
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const result = mode === "login"
      ? await client.auth.signInWithPassword({ email, password })
      : await client.auth.signUp({ email, password, options: { emailRedirectTo: callback } });
    setLoading(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (mode === "register" && !result.data.session) {
      setMessage("Check your email to confirm your account, then return to your workspace.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function signInWithGoogle() {
    setError(null);
    const client = createClient();
    const { error: providerError } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (providerError) setError(providerError.message);
  }

  if (!configured) {
    return <p role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">Authentication is unavailable because this deployment is not configured.</p>;
  }

  const otherMode = mode === "login" ? "register" : "login";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-semibold">Email<Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="flex flex-col gap-2 text-sm font-semibold">Password<Input type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {message && <p role="status" className="text-sm text-success">{message}</p>}
      <Button type="submit" variant="gradient" disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</Button>
      <button type="button" onClick={signInWithGoogle} className="rounded-lg border border-border-strong px-5 py-3 text-sm font-bold hover:bg-surface-elevated">Continue with Google</button>
      {mode === "login" && <Link href={`/forgot-password?next=${encodeURIComponent(next)}`} className="text-center text-sm text-accent-text hover:underline">Forgot password?</Link>}
      <p className="text-center text-sm text-foreground-muted">
        {mode === "login" ? "New to NextStage? " : "Already have an account? "}
        <Link className="text-accent-text hover:underline" href={`/${otherMode}?next=${encodeURIComponent(next)}`}>{mode === "login" ? "Create account" : "Log in"}</Link>
      </p>
    </form>
  );
}
