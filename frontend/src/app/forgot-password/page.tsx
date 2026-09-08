"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthPage from "@/components/auth/AuthPage";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/auth/client";
import { isAuthConfigured } from "@/lib/auth/config";
import { recoveryCallbackUrl, safeRedirectPath } from "@/lib/auth/redirect";

const RESEND_COOLDOWN_SECONDS = 60;

function ForgotPasswordForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const configured = isAuthConfigured();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (status === "sending" || cooldown > 0) return;
    const next = safeRedirectPath(params.get("next"));
    setStatus("sending");
    setMessage(null);
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: recoveryCallbackUrl(window.location.origin, next),
      });
      if (error) {
        if (process.env.NODE_ENV === "development") console.error("Password recovery email failed", error);
        setStatus("error");
        setMessage(error.message.toLowerCase().includes("rate")
          ? "Please wait a minute before requesting another reset link."
          : "We could not send the link right now. Check your connection and try again.");
        if (error.message.toLowerCase().includes("rate")) setCooldown(RESEND_COOLDOWN_SECONDS);
        return;
      }
      setStatus("sent");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setMessage("If an account exists for that address, a reset link is on its way. It expires in one hour.");
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("Password recovery email failed", error);
      setStatus("error");
      setMessage("We could not send the link right now. Check your connection and try again.");
    }
  }
  if (!configured) return <p role="alert" className="text-sm text-warning-text">Authentication is unavailable right now.</p>;
  const sending = status === "sending";
  return <form onSubmit={submit} className="flex flex-col gap-4">
    <label className="flex flex-col gap-2 text-sm font-semibold">Email<Input type="email" autoComplete="email" required disabled={sending} value={email} onChange={(event) => { setEmail(event.target.value); setMessage(null); if (status === "error") setStatus("idle"); }} /></label>
    {message && <p role={status === "error" ? "alert" : "status"} className={`text-sm ${status === "error" ? "text-warning-text" : "text-foreground-secondary"}`}>{message}</p>}
    <Button type="submit" variant="gradient" disabled={sending || cooldown > 0}>{sending ? "Sending…" : cooldown > 0 ? `Send again in ${cooldown}s` : status === "sent" ? "Resend reset link" : "Send reset link"}</Button>
    <Link href={`/login?next=${encodeURIComponent(safeRedirectPath(params.get("next")))}`} className="text-center text-sm font-semibold text-accent-text">Back to login</Link>
  </form>;
}

export default function ForgotPasswordPage() {
  return <AuthPage title="Reset your password" description="We will send a secure reset link to your email."><Suspense><ForgotPasswordForm /></Suspense></AuthPage>;
}
