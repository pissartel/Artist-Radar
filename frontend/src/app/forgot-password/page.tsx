"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthPage from "@/components/auth/AuthPage";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/auth/client";
import { isAuthConfigured } from "@/lib/auth/config";
import { safeRedirectPath } from "@/lib/auth/redirect";

function ForgotPasswordForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const configured = isAuthConfigured();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = safeRedirectPath(params.get("next"));
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/reset-password?next=${encodeURIComponent(next)}`)}`,
    });
    setStatus(error?.message ?? "Check your email for a password reset link.");
  }
  if (!configured) return <p role="alert">Authentication is unavailable.</p>;
  return <form onSubmit={submit} className="flex flex-col gap-4"><label className="flex flex-col gap-2 text-sm font-semibold">Email<Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>{status && <p role="status" className="text-sm text-foreground-secondary">{status}</p>}<Button type="submit" variant="gradient">Send reset link</Button></form>;
}

export default function ForgotPasswordPage() {
  return <AuthPage title="Reset your password" description="We’ll send a secure reset link to your email."><Suspense><ForgotPasswordForm /></Suspense></AuthPage>;
}
