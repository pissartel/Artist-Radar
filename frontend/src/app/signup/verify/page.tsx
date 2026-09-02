"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/brand/Logo";
import { buttonClassName } from "@/components/ui/Button";
import { safeRedirectPath } from "@/lib/auth/redirect";

function SignupVerifyContent() {
  const params = useSearchParams();
  const email = params.get("email") ?? "your email address";
  const next = safeRedirectPath(params.get("next"));
  return (
    <main className="animate-ns-in flex min-h-screen items-center justify-center px-5">
      <div className="flex w-full max-w-[440px] flex-col items-center gap-[22px]">
        <Logo />
        <section className="w-full rounded-2xl border border-border bg-surface p-8 text-center">
          <span className="mx-auto flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-accent-tint text-accent-text" aria-hidden="true">✉</span>
          <h1 className="mt-[18px] text-2xl font-extrabold">Confirm your email</h1>
          <p className="mt-3 text-[15px] text-foreground-secondary">We sent a link to {email}. Your analysis is already saved to this account, so you can confirm whenever you like.</p>
          <Link href={next} className={buttonClassName("secondary", "mt-6 w-full")}>Continue to my overview</Link>
        </section>
      </div>
    </main>
  );
}

export default function SignupVerifyPage() {
  return <Suspense><SignupVerifyContent /></Suspense>;
}
