import OnboardingForm from "@/components/onboarding/OnboardingForm";
import { isChartmetricToggleVisible } from "@/lib/server/chartmetricToggle";

// Server Component: computes the Chartmetric toggle's visibility using
// real, un-prefixed server env vars (never bundled into the client) and
// hands the result down as a plain boolean prop — see
// lib/server/chartmetricToggle.ts for why this can't be done client-side.
export default function OnboardingPage() {
  return <OnboardingForm showChartmetricToggle={isChartmetricToggleVisible()} />;
}
