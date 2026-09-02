"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthPage from "@/components/auth/AuthPage";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/auth/client";
import { safeRedirectPath } from "@/lib/auth/redirect";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) return setError("This reset link may have expired. Request a fresh link and try again.");
    router.replace(safeRedirectPath(params.get("next")));
  }
  return <form onSubmit={submit} className="flex flex-col gap-4"><label className="flex flex-col gap-2 text-sm font-semibold">New password<Input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>{error && <p role="alert" className="text-sm text-error">{error}</p>}<Button type="submit" variant="gradient">Update password</Button></form>;
}

export default function ResetPasswordPage() {
  return <AuthPage title="Choose a new password" description="Use at least eight characters."><Suspense><ResetPasswordForm /></Suspense></AuthPage>;
}
