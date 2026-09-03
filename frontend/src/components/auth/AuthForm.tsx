"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/auth/client";
import { enabledOAuthProviders, isAuthConfigured, type OAuthProvider } from "@/lib/auth/config";
import { safeRedirectPath } from "@/lib/auth/redirect";

const PASSWORD_MIN_LENGTH = 8;

function passwordValidation(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Include an uppercase letter, a lowercase letter, and a number.";
  }
  return null;
}

function friendlyError(message: string): string {
  const value = message.toLowerCase();
  if (value.includes("provider") && (value.includes("disabled") || value.includes("enabled") || value.includes("unsupported"))) return "That sign-in option is not available right now. Choose another sign-in method.";
  if (value.includes("already") || value.includes("registered")) return "You already have an account. Log in and we will attach your current analysis to it.";
  if (value.includes("password") || value.includes("credentials")) return "Check your email and password, then try again.";
  if (value.includes("rate")) return "Too many attempts. Wait a moment, then try again.";
  return "We could not complete that request. Check your connection and try again.";
}

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeRedirectPath(params.get("next") ?? (mode === "register" ? "/" : undefined));
  const conversion = params.get("from") === "results" || params.get("from") === "pipeline";
  const providers = enabledOAuthProviders();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [loadingMethod, setLoadingMethod] = useState<"password" | OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(params.get("error") === "auth_callback" ? "Sign-in could not be completed. Try again or choose another method." : null);
  const passwordError = mode === "register" && passwordTouched ? passwordValidation(password) : null;
  const confirmError = mode === "register" && confirmTouched && password !== confirmPassword ? "Passwords do not match." : null;
  const loading = loadingMethod !== null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setPasswordTouched(true);
    setConfirmTouched(true);
    if (mode === "register" && (passwordValidation(password) || password !== confirmPassword)) return;

    setError(null);
    setLoadingMethod("password");
    try {
      const client = createClient();
      const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const result = mode === "login"
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({ email, password, options: { emailRedirectTo: callback } });

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
    } catch {
      setError("We could not complete that request. Check your connection and try again.");
    } finally {
      setLoadingMethod(null);
    }
  }

  async function oauth(provider: OAuthProvider) {
    if (loading) return;
    setError(null);
    setLoadingMethod(provider);
    try {
      const { error: providerError } = await createClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (providerError) setError(friendlyError(providerError.message));
    } catch {
      setError("We could not start sign-in. Check your connection and try again.");
    } finally {
      setLoadingMethod(null);
    }
  }

  if (!isAuthConfigured()) {
    return <p role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning-text">Authentication is unavailable right now. Your guest analysis is still safe on this device.</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
      {providers.length > 0 && (
        <>
          <div className="flex gap-2.5">
            {providers.map((provider) => (
              <button key={provider} type="button" disabled={loading} onClick={() => oauth(provider)} className="ns-btn flex-1 rounded-xl border border-border-strong bg-surface-elevated p-3.5 text-sm font-bold capitalize hover:bg-[#24222F] disabled:pointer-events-none disabled:opacity-50">
                {loadingMethod === provider ? "Connecting…" : provider}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold text-muted"><i className="h-px flex-1 bg-border" />or<i className="h-px flex-1 bg-border" /></div>
        </>
      )}
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-foreground-secondary">
        Email
        <Input placeholder="you@band.com" error={Boolean(error)} type="email" autoComplete="email" required disabled={loading} value={email} onChange={(event) => { setEmail(event.target.value); setError(null); }} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-foreground-secondary">
        <span className="flex justify-between">Password{mode === "login" && <Link href={`/forgot-password?next=${encodeURIComponent(next)}`} className="text-accent-text">Forgot?</Link>}</span>
        <span className="relative">
          <Input placeholder={mode === "login" ? "Your password" : "At least 8 characters"} error={Boolean(error || passwordError)} type={showPassword ? "text" : "password"} minLength={mode === "register" ? PASSWORD_MIN_LENGTH : undefined} autoComplete={mode === "login" ? "current-password" : "new-password"} required disabled={loading} value={password} onBlur={() => setPasswordTouched(true)} onChange={(event) => { setPassword(event.target.value); setError(null); }} className="pr-16" />
          <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-3 text-xs font-bold text-accent-text" aria-label={`${showPassword ? "Hide" : "Show"} password`}>{showPassword ? "Hide" : "Show"}</button>
        </span>
      </label>
      {mode === "register" && (
        <>
          <p className="-mt-1 text-xs leading-relaxed text-muted">Use 8+ characters with uppercase, lowercase, and a number. Your auth provider may apply additional checks.</p>
          {passwordError && <p role="alert" className="-mt-1 text-[13px] font-semibold text-warning-text">{passwordError}</p>}
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-foreground-secondary">
            Confirm password
            <Input placeholder="Enter your password again" error={Boolean(confirmError)} type={showPassword ? "text" : "password"} autoComplete="new-password" required disabled={loading} value={confirmPassword} onBlur={() => setConfirmTouched(true)} onChange={(event) => { setConfirmPassword(event.target.value); setConfirmTouched(true); }} />
          </label>
          {confirmError && <p role="alert" className="-mt-1 text-[13px] font-semibold text-warning-text">{confirmError}</p>}
        </>
      )}
      {error && <p role="alert" className="text-[13px] font-semibold text-warning-text">{error}</p>}
      <Button type="submit" variant="gradient" disabled={loading} className="py-[15px]">{loadingMethod === "password" ? "Please wait…" : mode === "login" ? "Continue" : conversion ? "Create account and save" : "Create account"}</Button>
      <p className="text-xs leading-relaxed text-muted">By continuing, you agree to NextStage&apos;s terms and privacy policy.</p>
      <div className="mt-1 flex flex-col gap-2.5 border-t border-border pt-5 text-sm font-semibold text-foreground-muted">
        <p>{mode === "login" ? "New here? " : "Already have an account? "}<Link className="text-accent-text" href={`/${mode === "login" ? "signup" : "login"}?next=${encodeURIComponent(next)}${conversion ? "&from=results" : ""}`}>{mode === "login" ? "Create an account" : "Log in"}</Link></p>
        <p>{mode === "login" ? <>Or <Link href="/" className="text-accent-text">try NextStage without an account</Link></> : <>Rather see it first? <Link href="/" className="text-accent-text">Run an analysis without an account</Link></>}</p>
      </div>
    </form>
  );
}
