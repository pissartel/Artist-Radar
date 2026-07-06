"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArtistRadarErrorState } from "@/components/dashboard/ArtistRadarStates";
import { useArtistRadarData } from "@/lib/useArtistRadarData";

const STEP_INTERVAL_MS = 700;

const ANALYSIS_STEPS = [
  "Analyzing artist profile",
  "Finding similar artists",
  "Mapping music scene",
  "Scanning venues and concerts",
  "Scoring booking opportunities",
  "Building dashboard",
];

export default function AnalyzingPage() {
  const router = useRouter();
  const { state, refetch } = useArtistRadarData();
  const [activeStep, setActiveStep] = useState(0);

  const isRunning = state.status === "checking-onboarding" || state.status === "loading";

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const stepTimer = setInterval(() => {
      setActiveStep((step) => (step < ANALYSIS_STEPS.length - 1 ? step + 1 : step));
    }, STEP_INTERVAL_MS);
    return () => clearInterval(stepTimer);
  }, [isRunning]);

  useEffect(() => {
    if (state.status === "empty") {
      router.replace("/onboarding");
    }
  }, [state.status, router]);

  useEffect(() => {
    if (state.status === "success") {
      router.replace("/overview");
    }
  }, [state.status, router]);

  if (state.status === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <ArtistRadarErrorState message={state.message} onRetry={refetch} />
        </div>
      </div>
    );
  }

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
          {ANALYSIS_STEPS.map((step, index) => {
            const isComplete = index < activeStep;
            const isActive = index === activeStep;

            return (
              <li key={step} className="flex items-center gap-2.5 text-sm">
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
                  {step}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
