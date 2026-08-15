import type { CommercialTier, Opportunity, SimilarArtist } from "@/types";

// Issue #201: human-readable labels for the commercial-scale *relationship*
// tier — kept separate from the artist's own absolute scale (see
// COMMERCIAL_ABSOLUTE_SCALE_LABELS below). "scale_unknown" must never be
// silently displayed as any other tier.
export const COMMERCIAL_TIER_LABELS: Record<CommercialTier, string> = {
  same_level: "Same level",
  slightly_larger: "Slightly larger",
  aspirational: "Aspirational reference",
  major_reference: "Major reference",
  local_compatible_artist: "Local match",
  scale_unknown: "Scale unknown",
};

// Short qualitative "Scale fit" wording shown alongside the musical-match
// and overall-relevance percentages on the similar-artist card.
const SCALE_FIT_LABELS: Record<CommercialTier, string> = {
  same_level: "Great fit",
  slightly_larger: "Good fit",
  aspirational: "Ambitious reach",
  major_reference: "Very low",
  local_compatible_artist: "Local fit",
  scale_unknown: "Unknown",
};

export function getCommercialTierLabel(tier?: CommercialTier): string {
  return tier ? COMMERCIAL_TIER_LABELS[tier] : "Scale unknown";
}

export function getScaleFitLabel(tier?: CommercialTier): string {
  return tier ? SCALE_FIT_LABELS[tier] : "Unknown";
}

export function hasKnownCommercialScale(tier?: CommercialTier): boolean {
  return Boolean(tier && tier !== "scale_unknown");
}

export function getNotorietyLabel(artist: SimilarArtist): string | null {
  switch (artist.commercialAbsoluteScale) {
    case "major":
      return "Major artist";
    case "established":
      return "Established artist";
    case "developing":
      return "Developing artist";
    case "emerging":
      return "Emerging artist";
  }

  switch (artist.artistTier) {
    case "headliner":
      return "Headliner";
    case "established":
      return "Established artist";
    case "rising":
      return "Rising artist";
    case "emerging":
      return "Emerging artist";
  }

  return null;
}

function getCommercialScaleSortPenalty(artist: SimilarArtist): number {
  switch (artist.commercialTier) {
    case "major_reference":
      return 2;
    case "aspirational":
      return 1;
    default:
      return 0;
  }
}

export function sortSimilarArtistsByMatch(artists: SimilarArtist[]): SimilarArtist[] {
  return [...artists].sort((a, b) => {
    const scalePenaltyDiff = getCommercialScaleSortPenalty(a) - getCommercialScaleSortPenalty(b);
    if (scalePenaltyDiff !== 0) return scalePenaltyDiff;

    const musicalDiff = (b.musicalMatchScore ?? b.matchScore) - (a.musicalMatchScore ?? a.matchScore);
    if (musicalDiff !== 0) return musicalDiff;

    const overallDiff = b.matchScore - a.matchScore;
    if (overallDiff !== 0) return overallDiff;

    return a.name.localeCompare(b.name);
  });
}

// A plain-language explanation of the commercial-scale relationship for the
// detail page — never mentions Chartmetric or any other provider name.
export function getCommercialExplanation(artist: SimilarArtist): string {
  const genre = artist.genres[0];
  const genreText = genre ? ` for ${genre}` : "";
  switch (artist.commercialTier) {
    case "major_reference":
      return `Strong musical reference${genreText}, but substantially larger than the analyzed artist. Useful as a genre reference rather than a comparable booking-level artist.`;
    case "aspirational":
      return `A meaningfully bigger act${genreText} — a realistic aspirational reference rather than a same-level booking peer.`;
    case "slightly_larger":
      return `A somewhat bigger act${genreText}, still close enough in scale to be a useful comparison.`;
    case "same_level":
      return `Comparable commercial scale${genreText} — a realistic same-level booking peer.`;
    case "local_compatible_artist":
      return `Strong local/scene fit${genreText}, even though its overall audience size differs.`;
    case "scale_unknown":
    default:
      return "Commercial scale could not be verified from the available sources.";
  }
}

export function getSimilarArtistById(
  artists: SimilarArtist[],
  id: string,
): SimilarArtist | undefined {
  return artists.find((artist) => artist.id === id);
}

export function getRelatedOpportunities(
  opportunities: Opportunity[],
  similarArtistId: string,
): Opportunity[] {
  return opportunities.filter((opportunity) =>
    opportunity.relatedSimilarArtistIds?.includes(similarArtistId),
  );
}

export function formatMonthlyListeners(value?: number): string | null {
  if (value === undefined) return null;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toString();
}

export function getSharedGenres(
  artist: SimilarArtist,
  referenceGenres: string[],
): string[] {
  if (artist.sharedGenres) return artist.sharedGenres;
  return artist.genres.filter((genre) => referenceGenres.includes(genre));
}

export function formatGenrePreview(genres: string[], maxVisible = 3): string {
  if (genres.length <= maxVisible) return genres.join(", ");
  const remaining = genres.length - maxVisible;
  return `${genres.slice(0, maxVisible).join(", ")} +${remaining}`;
}
