"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArtistRadarErrorState } from "@/components/dashboard/ArtistRadarStates";
import { DEFAULT_ANALYSIS_STEPS } from "@/lib/analysisSteps";
import { fetchAnalysisJobStatus } from "@/lib/artistRadarClient";
import type { AnalysisJobStatus } from "@/types/artistRadar";

const POLL_INTERVAL_MS = 1500;
const COMPLETION_HOLD_MS = 500;

function AnalyzingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");

  const query = useQuery<AnalysisJobStatus>({
    queryKey: ["analysisJobStatus", jobId],
    queryFn: () => fetchAnalysisJobStatus(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (currentQuery) => {
      if (currentQuery.state.status === "error") {
        return false;
      }
      const status = currentQuery.state.data?.status;
      return status === "completed" || status === "failed" ? false : POLL_INTERVAL_MS;
    },
  });

  useEffect(() => {
    if (!jobId) {
      router.replace("/onboarding");
    }
  }, [jobId, router]);

  useEffect(() => {
    if (query.data?.status !== "completed") {
      return;
    }
    const navigateTimer = setTimeout(() => {
      router.replace(`/overview?jobId=${encodeURIComponent(jobId as string)}`);
    }, COMPLETION_HOLD_MS);
    return () => clearTimeout(navigateTimer);
  }, [query.data?.status, jobId, router]);

  if (!jobId) {
    return null;
  }

  const isFailed = query.data?.status === "failed" || query.isError;
  if (isFailed) {
    const message = query.data?.error ?? "Something went wrong while analyzing this artist. Please try again.";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <ArtistRadarErrorState message={message} onRetry={() => router.replace("/onboarding")} />
        </div>
      </div>
    );
  }

  const steps = query.data?.steps ?? DEFAULT_ANALYSIS_STEPS;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div
        className="w-full max-w-sm text-center"
        role="status"
        aria-live="polite"
        aria-label="Analyzing artist profile"
      >
        <div
          className="w-12 h-12 mx-auto rounded-full border-2 border-accent/20 border-t-accent-light animate-spin"
          aria-hidden="true"
        />
        <h1 className="text-lg font-semibold text-white mt-5">
          Analyzing your artist profile...
        </h1>
        <p className="text-sm text-gray-400 mt-1.5">
          We&apos;re running the real analysis now. This can take a few seconds.
        </p>

        <ul className="mt-6 flex flex-col gap-2.5 text-left bg-card rounded-xl border border-slate-400/10 shadow-card-glow p-4">
          {steps.map((step) => {
            const isComplete = step.status === "completed";
            const isActive = step.status === "running";

            return (
              <li key={step.id} className="flex items-center gap-2.5 text-sm">
                {isComplete ? (
                  <span className="w-4 h-4 shrink-0 rounded-full bg-accent-green/20 text-accent-green flex items-center justify-center text-[10px] leading-none">
                    ✓
                  </span>
                ) : isActive ? (
                  <span className="w-4 h-4 shrink-0 rounded-full border-2 border-accent/20 border-t-accent-light animate-spin" />
                ) : (
                  <span className="w-4 h-4 shrink-0 rounded-full border border-slate-400/20" />
                )}
                <span
                  className={
                    isComplete
                      ? "text-gray-400"
                      : isActive
                        ? "text-white font-medium"
                        : "text-gray-600"
                  }
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default function AnalyzingPage() {
  return (
    <Suspense fallback={null}>
      <AnalyzingContent />
    </Suspense>
  );
}
