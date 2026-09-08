"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthPage from "@/components/auth/AuthPage";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/auth/client";
import { PASSWORD_MIN_LENGTH, passwordValidation } from "@/lib/auth/password";
import { safeRedirectPath } from "@/lib/auth/redirect";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<"checking" | "valid" | "invalid">("checking");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = safeRedirectPath(params.get("next"));
  const passwordError = passwordTouched ? passwordValidation(password) : null;
  const confirmError = confirmTouched && password !== confirmPassword ? "Passwords do not match." : null;

  useEffect(() => {
    if (params.get("recovery_error")) {
      setSessionStatus("invalid");
      return;
    }
    createClient().auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError && process.env.NODE_ENV === "development") console.error("Recovery session check failed", sessionError);
      setSessionStatus(data.session ? "valid" : "invalid");
    }).catch((sessionError: unknown) => {
      if (process.env.NODE_ENV === "development") console.error("Recovery session check failed", sessionError);
      setSessionStatus("invalid");
    });
  }, [params]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading || sessionStatus !== "valid") return;
    setPasswordTouched(true);
    setConfirmTouched(true);
    if (passwordValidation(password) || password !== confirmPassword) return;
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) {
        if (process.env.NODE_ENV === "development") console.error("Password update failed", updateError);
        setError("We could not update your password. The reset link may have expired; request a fresh one and try again.");
        return;
      }
      setSuccess(true);
    } catch (updateError) {
      if (process.env.NODE_ENV === "development") console.error("Password update failed", updateError);
      setError("We could not update your password. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const recoveryHref = `/forgot-password?next=${encodeURIComponent(next)}`;
  if (sessionStatus === "checking") return <p role="status" className="text-sm text-foreground-secondary">Checking your reset link…</p>;
  if (sessionStatus === "invalid") return <div className="flex flex-col gap-4"><p role="alert" className="text-sm text-warning-text">This reset link is invalid or has expired.</p><Link href={recoveryHref} className="text-sm font-semibold text-accent-text">Request a new reset link</Link></div>;
  if (success) return <div className="flex flex-col gap-4"><p role="status" className="text-sm text-foreground-secondary">Your password has been updated successfully.</p><Button type="button" variant="gradient" onClick={() => { router.replace(next); router.refresh(); }}>Continue to NextStage</Button></div>;

  return <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
    <label className="flex flex-col gap-2 text-sm font-semibold">New password<span className="relative"><Input type={showPassword ? "text" : "password"} minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" required disabled={loading} error={Boolean(passwordError)} value={password} onBlur={() => setPasswordTouched(true)} onChange={(event) => { setPassword(event.target.value); setError(null); }} className="pr-16" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-3 text-xs font-bold text-accent-text" aria-label={`${showPassword ? "Hide" : "Show"} password`}>{showPassword ? "Hide" : "Show"}</button></span></label>
    <p className="-mt-2 text-xs leading-relaxed text-muted">Use 8+ characters with uppercase, lowercase, and a number.</p>
    {passwordError && <p role="alert" className="-mt-2 text-sm font-semibold text-warning-text">{passwordError}</p>}
    <label className="flex flex-col gap-2 text-sm font-semibold">Confirm new password<Input type={showPassword ? "text" : "password"} autoComplete="new-password" required disabled={loading} error={Boolean(confirmError)} value={confirmPassword} onBlur={() => setConfirmTouched(true)} onChange={(event) => { setConfirmPassword(event.target.value); setConfirmTouched(true); setError(null); }} /></label>
    {confirmError && <p role="alert" className="-mt-2 text-sm font-semibold text-warning-text">{confirmError}</p>}
    {error && <><p role="alert" className="text-sm text-warning-text">{error}</p><Link href={recoveryHref} className="text-sm font-semibold text-accent-text">Request a new reset link</Link></>}
    <Button type="submit" variant="gradient" disabled={loading}>{loading ? "Updating password…" : "Update password"}</Button>
  </form>;
}

export default function ResetPasswordPage() {
  return <AuthPage title="Choose a new password" description="Use at least eight characters."><Suspense><ResetPasswordForm /></Suspense></AuthPage>;
}
