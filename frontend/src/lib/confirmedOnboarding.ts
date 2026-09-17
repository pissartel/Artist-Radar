import type { OnboardingFormData } from "@/types";

interface ConfirmedOnboardingInput {
  artistName: string;
  spotifyUrl?: string | null;
  genres: string[];
  genre: string;
  city: string;
  countryOfOrigin: string;
  targetLocation: string;
  createdAt?: string;
}

export type ConfirmedOnboardingData = OnboardingFormData & {
  guestCreatedAt: string;
};

export function buildConfirmedOnboardingData({
  artistName,
  spotifyUrl,
  genres,
  genre,
  city,
  countryOfOrigin,
  targetLocation,
  createdAt = new Date().toISOString(),
}: ConfirmedOnboardingInput): ConfirmedOnboardingData {
  return {
    artistName: artistName.trim(),
    spotifyUrl: spotifyUrl?.trim() ?? "",
    youtubeUrl: "",
    instagramUrl: "",
    websiteUrl: "",
    countryOfOrigin: countryOfOrigin.trim(),
    city: city.trim(),
    mainGenre: genre.trim(),
    secondaryGenres: genres.slice(1).join(", "),
    targetLocation: targetLocation.trim(),
    mainGoal: "booking_opportunities",
    useChartmetricEnrichment: false,
    chartmetricToggleVisible: false,
    usePreviewData: false,
    previewDataToggleVisible: false,
    guestCreatedAt: createdAt,
  };
}
