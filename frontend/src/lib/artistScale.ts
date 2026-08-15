import type {
  ArtistScaleBand,
  ArtistScaleComparisonClassification,
  ArtistScaleScoreConfidence,
} from "@/types";

export const ARTIST_SCALE_BAND_LABELS: Record<ArtistScaleBand, string> = {
  emerging: "Emerging",
  developing: "Developing",
  established_local: "Established (local)",
  regional: "Regional",
  national: "National",
  major: "Major",
};

export const ARTIST_SCALE_CLASSIFICATION_LABELS: Record<ArtistScaleComparisonClassification, string> = {
  well_below: "Well below similar artists",
  slightly_below: "Slightly below similar artists",
  in_line: "In line with similar artists",
  slightly_above: "Slightly above similar artists",
  well_above: "Well above similar artists",
};

export const ARTIST_SCALE_CONFIDENCE_LABELS: Record<ArtistScaleScoreConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  unavailable: "Not enough data",
};

// Confidence reflects data coverage, not a good/bad verdict, so it reuses the
// same neutral-to-warm scale as the rest of the app's confidence badges
// rather than a red/green pass-fail treatment.
export function getArtistScaleConfidenceClass(confidence: ArtistScaleScoreConfidence): string {
  switch (confidence) {
    case "high":
      return "text-success-text bg-success-tint border-success-tint";
    case "medium":
      return "text-accent-text bg-accent-tint border-accent-tint";
    case "low":
      return "text-warning-text bg-warning-tint border-warning-tint";
    default:
      return "text-foreground-muted bg-white/5 border-border";
  }
}

export function describeRelativeArtistScale(candidateScore: number, analyzedScore?: number | null): string {
  if (analyzedScore === null || analyzedScore === undefined) {
    return "Audience position relative to your artist is unavailable.";
  }

  const difference = candidateScore - analyzedScore;
  if (difference >= 20) return "Substantially larger audience than your artist.";
  if (difference >= 8) return "Slightly larger audience than your artist.";
  if (difference <= -20) return "Substantially smaller audience than your artist.";
  if (difference <= -8) return "Slightly smaller audience than your artist.";
  return "Similar audience size to your artist.";
}
