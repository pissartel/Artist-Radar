"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/brand/Logo";
import Button, { buttonClassName } from "@/components/ui/Button";
import { createClient } from "@/lib/auth/client";
import { safeRedirectPath } from "@/lib/auth/redirect";

const RESEND_COOLDOWN_SECONDS = 30;

function SignupVerifyContent() {
  const params = useSearchParams();
  const email = params.get("email")?.trim() || null;
  const next = safeRedirectPath(params.get("next"));
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resendConfirmation() {
    if (!email || resending || cooldown > 0) return;
    setResending(true);
    setStatus(null);
    try {
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await createClient().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo },
      });
      if (error) {
        setStatus({
          tone: "error",
          message: error.message.toLowerCase().includes("rate")
            ? "Too many requests. Wait a moment, then try again."
            : "We could not resend the confirmation email. Check your connection and try again.",
        });
        return;
      }
      setStatus({ tone: "success", message: "Confirmation email sent again." });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setStatus({ tone: "error", message: "We could not resend the confirmation email. Check your connection and try again." });
    } finally {
      setResending(false);
    }
  }
  return (
    <main className="animate-ns-in flex min-h-screen items-center justify-center px-5">
      <div className="flex w-full max-w-[440px] flex-col items-center gap-[22px]">
        <Logo />
        <section className="w-full rounded-2xl border border-border bg-surface p-8 text-center">
          <span className="mx-auto flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-accent-tint text-accent-text" aria-hidden="true">✉</span>
          <h1 className="mt-[18px] text-2xl font-extrabold">Confirm your email</h1>
          <p className="mt-3 text-[15px] text-foreground-secondary">{email ? <>We sent a link to {email}. Your analysis is already saved to this account, so you can confirm whenever you like.</> : <>We could not find the email address for this confirmation. Return to sign up to request a new confirmation email.</>}</p>
          {email ? (
            <Button type="button" variant="gradient" disabled={resending || cooldown > 0} onClick={resendConfirmation} className="mt-6 w-full">
              {resending ? "Sending…" : cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend confirmation email"}
            </Button>
          ) : (
            <Link href={`/signup?next=${encodeURIComponent(next)}`} className={buttonClassName("gradient", "mt-6 w-full")}>Return to sign up</Link>
          )}
          {status && <p role={status.tone === "error" ? "alert" : "status"} className={`mt-3 text-[13px] font-semibold ${status.tone === "success" ? "text-success-text" : "text-warning-text"}`}>{status.message}</p>}
          <Link href={next} className={buttonClassName("secondary", "mt-6 w-full")}>Continue to my overview</Link>
        </section>
      </div>
    </main>
  );
}

export default function SignupVerifyPage() {
  return <Suspense><SignupVerifyContent /></Suspense>;
}
