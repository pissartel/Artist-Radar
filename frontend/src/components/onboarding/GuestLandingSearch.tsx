"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Button, { buttonClassName } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { clearArtistRadarResponse } from "@/lib/artistRadarResponseCache";

interface ReturningGuest {
  artistName: string;
  expired: boolean;
}

export default function GuestLandingSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [returningGuest, setReturningGuest] = useState<ReturningGuest | null>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("artistRadarOnboardingData") ?? "null") as { artistName?: unknown; guestCreatedAt?: unknown } | null;
      const createdAt = typeof stored?.guestCreatedAt === "string" ? Date.parse(stored.guestCreatedAt) : Date.now();
      const isWithinRetention = Number.isFinite(createdAt) && Date.now() - createdAt < 30 * 24 * 60 * 60 * 1000;
      if (typeof stored?.artistName === "string" && stored.artistName.trim() && isWithinRetention) {
        setReturningGuest({ artistName: stored.artistName.trim(), expired: false });
      } else if (typeof stored?.artistName === "string" && stored.artistName.trim()) {
        setReturningGuest({ artistName: stored.artistName.trim(), expired: true });
      }
    } catch {
      // Local persistence is optional in privacy-focused browser contexts.
    }
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    window.sessionStorage.setItem("nextstageArtistQuery", value);
    router.push(`/start?q=${encodeURIComponent(value)}`);
  }

  function startAnother() {
    setReturningGuest(null);
    setQuery("");
  }

  function rerunExpiredAnalysis() {
    clearArtistRadarResponse();
    router.push("/analyzing");
  }

  return (
    <div className="mt-2 flex w-full max-w-[560px] flex-col gap-3">
      {returningGuest && (
        <aside className="rounded-[14px] border border-primary/30 bg-surface p-5 text-left">
          <p className="text-base font-extrabold">{returningGuest.expired ? "That analysis has expired" : "Pick up where you left off"}</p>
          <p className="mt-1 text-sm text-foreground-secondary">{returningGuest.expired ? `Guest results are kept for 30 days. We still have ${returningGuest.artistName} identified, so rerunning takes one tap.` : `Your ${returningGuest.artistName} analysis is still here on this device.`}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {returningGuest.expired ? <button type="button" onClick={rerunExpiredAnalysis} className={buttonClassName("secondary", "px-4 py-2.5")}>Rerun for {returningGuest.artistName}</button> : <Link href="/overview" className={buttonClassName("secondary", "px-4 py-2.5")}>Continue</Link>}
            {!returningGuest.expired && <Link href="/signup?from=results&next=%2Foverview" className={buttonClassName("ghost", "px-4 py-2.5")}>Create account and save</Link>}
            <button type="button" onClick={startAnother} className="ns-btn px-2 text-sm font-semibold text-foreground-muted hover:text-foreground">Start another analysis</button>
          </div>
        </aside>
      )}
      {!returningGuest && (
        <form onSubmit={submit} className="flex flex-col gap-2.5 sm:flex-row">
          <Input aria-label="Artist name" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Your artist name" className="min-h-14 flex-1 rounded-xl px-[18px] text-base" />
          <Button type="submit" variant="gradient" className="min-h-14 whitespace-nowrap px-7 text-base">Try NextStage</Button>
        </form>
      )}
      <p className="text-[13px] font-semibold text-muted">Free. No card, no signup. Your results are saved on this device for 30 days.</p>
    </div>
  );
}
