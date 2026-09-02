"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/brand/Logo";
import { ArtistRadarErrorState } from "@/components/dashboard/ArtistRadarStates";
import { useArtistRadarData } from "@/lib/useArtistRadarData";
import { usePipelineProgress } from "@/lib/usePipelineProgress";
import { PIPELINE_STAGES } from "@/lib/pipelineStages";

const COMPLETION_HOLD_MS = 500;

export default function AnalyzingPage() {
  const router = useRouter();
  const { state, refetch, executionId } = useArtistRadarData();
  const [artistName, setArtistName] = useState("your artist");
  const [offline, setOffline] = useState(false);
  const isRunning = state.status === "checking-onboarding" || state.status === "loading";
  const isReady = state.status === "success";
  const { completedCount, activeIndex } = usePipelineProgress({
    executionId,
    active: isRunning,
    ready: isReady,
  });

  useEffect(() => {
    try {
      const onboarding = JSON.parse(window.localStorage.getItem("artistRadarOnboardingData") ?? "{}");
      if (typeof onboarding.artistName === "string" && onboarding.artistName.trim()) {
        setArtistName(onboarding.artistName.trim());
      }
    } catch {
      // The generic heading remains valid when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    const update = () => setOffline(!window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (state.status === "empty") {
      router.replace("/onboarding");
    }
  }, [state.status, router]);

  useEffect(() => {
    if (state.status !== "success") return;
    const navigateTimer = window.setTimeout(() => router.replace("/overview"), COMPLETION_HOLD_MS);
    return () => window.clearTimeout(navigateTimer);
  }, [state.status, router]);

  const findings = useMemo(() => {
    if (state.status !== "success") return new Map<number, string>();
    const { artist, similarArtists, bookingOpportunities } = state.data;
    const concertCount = bookingOpportunities.filter((item) => item.type === "concert").length;
    const venueCount = bookingOpportunities.filter((item) => item.type === "venue").length;
    const festivalCount = bookingOpportunities.filter((item) => item.type === "festival").length;
    return new Map([
      [0, `Matched ${artist.name}${artist.platforms?.length ? ` on ${artist.platforms.map((item) => item.type).join(", ")}` : ""}`],
      [1, [artist.metrics?.followers && `${artist.metrics.followers.toLocaleString()} followers`, artist.genres.slice(0, 2).join(", "), artist.location].filter(Boolean).join(" · ")],
      [2, `${similarArtists.length} artists at a comparable scale`],
      [3, `${concertCount} concerts, ${venueCount} venues and ${festivalCount} festivals found`],
      [4, "Ranked on genre fit, artist scale and geography"],
      [5, "Building your NextStage overview"],
    ]);
  }, [state]);

  if (state.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <ArtistRadarErrorState message={state.message} onRetry={refetch} />
          <p className="mt-3 text-center text-sm text-foreground-secondary">We kept every completed step. Retrying resumes your analysis.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="animate-ns-in mx-auto flex min-h-screen w-full max-w-[620px] flex-col gap-7 px-5 py-14">
      <div className="text-center"><Logo /></div>
      <section className="text-center">
        <h1 className="text-[30px] font-extrabold tracking-[-.02em]">Researching {artistName}</h1>
        <p className="mt-2 text-[15px] text-foreground-secondary">{isReady ? "Done. Opening your overview." : "We are reading the live scene around your genre, your scale and your region."}</p>
      </section>
      {offline && <aside role="alert" className="rounded-xl border border-info/30 bg-info-tint p-3.5 text-sm text-info-text">You are offline. The analysis keeps running server-side and this page will reconnect automatically.</aside>}
      <ul role="status" aria-live="polite" aria-label="Analyzing artist profile" className="rounded-2xl border border-border bg-surface p-2">
        {PIPELINE_STAGES.map(({ stage, label }, index) => {
          const isComplete = index < completedCount;
          const isActive = index === activeIndex;
          const finding = findings.get(index);
          return (
            <li key={stage} className={`ns-stage-row flex items-start gap-3.5 rounded-xl px-4 py-3.5 transition-[background] duration-200 ${isActive ? "bg-primary/[.07]" : ""}`}>
              <span className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isComplete ? "bg-success-tint text-success-text" : isActive ? "ns-stage-dot--active animate-ns-pulse" : "border border-white/10 text-muted"}`} aria-hidden="true">
                {isComplete ? "✓" : isActive ? "" : index + 1}
              </span>
              <span>
                <span className={`block text-[15px] ${isActive ? "font-bold text-foreground" : isComplete ? "font-semibold text-foreground-secondary" : "font-semibold text-muted"}`}>{label}</span>
                {finding && <span className="block animate-ns-in-slow text-[13px] leading-[1.45] text-foreground-muted">{finding}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <aside className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[.08] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold">Want this waiting for you?</p>
          <p className="text-[13px] text-foreground-secondary">Create your account while it runs. We attach the results when they land.</p>
        </div>
        <Link href="/signup?from=pipeline&next=%2Foverview" className="ns-btn whitespace-nowrap rounded-[10px] border border-border-strong bg-surface-elevated px-[18px] py-[11px] text-center text-[13px] font-bold">Create account</Link>
      </aside>
    </main>
  );
}
