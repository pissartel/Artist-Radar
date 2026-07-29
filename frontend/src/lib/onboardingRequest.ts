import { productFeatures } from "@/lib/productFeatures";
import type { ArtistRadarRequest } from "@/types/artistRadar";
import type { OnboardingFormData } from "@/types";

const ONBOARDING_STORAGE_KEY = "artistRadarOnboardingData";

export function readOnboardingRequest(): ArtistRadarRequest | null {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!stored) {
    return null;
  }

  let onboarding: Partial<OnboardingFormData>;
  try {
    onboarding = JSON.parse(stored);
  } catch {
    return null;
  }

  const artistName = onboarding.artistName?.trim();
  const genre = onboarding.mainGenre?.trim();
  const location = onboarding.city?.trim() || onboarding.countryOfOrigin?.trim();

  if (!artistName || !genre || !location) {
    return null;
  }

  const spotifyUrl = onboarding.spotifyUrl?.trim();
  // Only ever sent when the preview/dev-only toggle is both rendered and
  // checked (issue #142) — in production productFeatures.chartmetricToggle
  // is always false, so this stays omitted regardless of stored form data.
  const chartmetricArtistEnrichment = productFeatures.chartmetricToggle && onboarding.useChartmetricEnrichment === true;

  return {
    artistName,
    genre,
    location,
    enableBooking: onboarding.mainGoal !== "similar_artists",
    ...(spotifyUrl ? { spotifyUrl } : {}),
    ...(chartmetricArtistEnrichment ? { features: { chartmetricArtistEnrichment: true } } : {}),
  };
}
