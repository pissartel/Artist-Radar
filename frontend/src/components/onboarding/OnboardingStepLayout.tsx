import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import StepIndicator from "@/components/onboarding/StepIndicator";

interface OnboardingStepLayoutProps {
  step: number;
  totalSteps: number;
  showLogo?: boolean;
  backHref?: string;
  children: ReactNode;
}

/**
 * Shared shell for the onboarding/analysis flow so every step anchors its
 * step indicator to the same top offset and max-width container instead of
 * each page centering its content vertically and positioning the label with
 * its own arbitrary margins.
 */
export default function OnboardingStepLayout({
  step,
  totalSteps,
  showLogo = false,
  backHref,
  children,
}: OnboardingStepLayoutProps) {
  return (
    <div className="relative min-h-screen bg-background flex justify-center p-4 sm:p-6">
      {backHref && (
        <Link
          href={backHref}
          className="absolute top-4 left-4 sm:top-6 sm:left-6 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground-muted hover:text-foreground transition-colors"
        >
          ← Back
        </Link>
      )}
      <div className="w-full max-w-2xl pt-10 sm:pt-14">
        {showLogo && (
          <Image
            src="/brand/logo-next-stage-dark.png"
            alt="NextStage"
            width={136}
            height={32}
            priority
            className="h-8 w-auto mx-auto"
          />
        )}
        <StepIndicator step={step} totalSteps={totalSteps} className={showLogo ? "mt-4" : undefined} />
        {children}
      </div>
    </div>
  );
}
