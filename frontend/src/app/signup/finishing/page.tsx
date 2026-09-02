"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "@/components/brand/Logo";
import { safeRedirectPath } from "@/lib/auth/redirect";

function SignupFinishingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeRedirectPath(params.get("next"));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch("/api/anonymous-analysis/claim", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) throw new Error("claim failed");
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        if (!cancelled) router.replace(`${next}${next.includes("?") ? "&" : "?"}saved=1`);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attempt, next, router]);

  if (failed) {
    return (
      <main className="animate-ns-in flex min-h-screen items-center justify-center px-5">
        <section className="w-full max-w-[440px] rounded-2xl border border-warning/30 bg-surface p-8 text-center">
          <h1 className="text-[22px] font-extrabold">Your account is ready, results are still moving</h1>
          <p className="mt-3 text-[15px] text-foreground-secondary">Your account was created. Attaching the analysis did not finish. It is still on this device and you can retry safely.</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="ns-btn mt-6 rounded-xl bg-primary px-6 py-3 text-sm font-bold">Retry now</button>
          <Link href={next} className="ml-4 text-sm font-semibold text-foreground-muted">Continue without it</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="animate-ns-in flex min-h-screen items-center justify-center px-5">
      <section className="flex w-full max-w-[440px] flex-col items-center gap-6 text-center" role="status" aria-live="polite">
        <Logo />
        <span className="h-11 w-11 rounded-full border-2 border-white/10 border-t-accent-text animate-ns-spin" aria-hidden="true" />
        <h1 className="text-[22px] font-extrabold">Moving your analysis over</h1>
        <p className="text-[15px] text-foreground-secondary">Attaching your pipeline results</p>
      </section>
    </main>
  );
}

export default function SignupFinishingPage() {
  return <Suspense><SignupFinishingContent /></Suspense>;
}
