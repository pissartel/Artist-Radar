import type { Opportunity, SimilarArtist } from "@/types";

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
