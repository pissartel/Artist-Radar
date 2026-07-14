"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArtistRadarErrorState } from "@/components/dashboard/ArtistRadarStates";
import OnboardingStepLayout from "@/components/onboarding/OnboardingStepLayout";
import { useArtistRadarData } from "@/lib/useArtistRadarData";

const STEP_INTERVAL_MS = 3000;
const COMPLETION_HOLD_MS = 500;

const ANALYSIS_STEPS = [
  "Analyzing artist profile",
  "Finding similar artists",
  "Mapping music scene",
  "Scanning venues and concerts",
  "Scoring opportunities",
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
      // Stop one step short of the end while still running so the checklist
      // never sits fully "active" on the last item before the analysis is
      // actually done; the success handler below fills in the final step.
      setActiveStep((step) => (step < ANALYSIS_STEPS.length - 2 ? step + 1 : step));
    }, STEP_INTERVAL_MS);
    return () => clearInterval(stepTimer);
  }, [isRunning]);

  useEffect(() => {
    if (state.status === "empty") {
      router.replace("/onboarding");
    }
  }, [state.status, router]);

  useEffect(() => {
    if (state.status !== "success") {
      return;
    }
    // If the API resolves before the checklist animation catches up, mark
    // every step as completed and hold briefly before navigating away so the
    // loading state never jumps straight to the dashboard mid-checklist.
    setActiveStep(ANALYSIS_STEPS.length);
    const navigateTimer = setTimeout(() => {
      router.replace("/overview");
    }, COMPLETION_HOLD_MS);
    return () => clearTimeout(navigateTimer);
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
    <OnboardingStepLayout step={2} totalSteps={2}>
      <div
        className="w-full max-w-sm mx-auto text-center"
        role="status"
        aria-live="polite"
        aria-label="Analyzing artist profile"
      >
        <div
          className="w-12 h-12 mx-auto rounded-full border-2 border-loader-track border-t-primary animate-spin mt-6"
          aria-hidden="true"
        />
        <h1 className="text-lg font-semibold text-foreground mt-6">
          Analyzing your artist profile...
        </h1>
        <p className="text-sm text-foreground-secondary mt-1.5">
          We&apos;re running the real analysis now. This can take a few seconds.
        </p>

        <ul className="mt-6 flex flex-col gap-2.5 text-left bg-surface rounded-xl border border-border shadow-card-glow p-4">
          {ANALYSIS_STEPS.map((step, index) => {
            const isComplete = index < activeStep;
            const isActive = index === activeStep;

            return (
              <li key={step} className="flex items-center gap-2.5 text-sm">
                {isComplete ? (
                  <span className="w-4 h-4 shrink-0 rounded-full bg-success-surface text-success flex items-center justify-center text-[10px] leading-none">
                    ✓
                  </span>
                ) : isActive ? (
                  <span className="w-4 h-4 shrink-0 rounded-full border-2 border-loader-track border-t-primary animate-spin" />
                ) : (
                  <span className="w-4 h-4 shrink-0 rounded-full border border-border-strong flex items-center justify-center text-[10px] font-semibold text-foreground-muted leading-none">
                    {index + 1}
                  </span>
                )}
                <span
                  className={
                    isComplete
                      ? "text-foreground-secondary"
                      : isActive
                        ? "text-foreground font-medium"
                        : "text-foreground-muted"
                  }
                >
                  {step}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </OnboardingStepLayout>
  );
}
