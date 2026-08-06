import type { SimilarArtist } from "../schemas.js";

export interface SimilarArtistEligibilityDiagnostic {
  artistName: string;
  bookingCategory: string | null;
  genreRelevance: number | null;
  estimatedFollowers: number | null;
  artistTier: string | null;
  rejectedReason: string | null;
}

const BOOKING_VENUE_CATEGORIES = new Set(["regional_peer", "support_target"]);

export function canGenerateBookingVenue(artist: SimilarArtist): boolean {
  return artist.bookingCategory === "regional_peer" || artist.bookingCategory === "support_target";
}

export function isEligibleSimilarArtistForBookingVenueDiscovery(artist: SimilarArtist): boolean {
  return artist.verificationStatus === "verified" &&
    canGenerateBookingVenue(artist) &&
    artist.genreRelevance >= 60;
}

export function explainSimilarArtistVenueEligibility(artist: SimilarArtist): SimilarArtistEligibilityDiagnostic {
  let rejectedReason: string | null = null;
  if (artist.verificationStatus !== "verified") {
    rejectedReason = "not_verified";
  } else if (!canGenerateBookingVenue(artist)) {
    rejectedReason = artist.bookingCategory === "reference" ? "reference_artist" : "unsupported_booking_category";
  } else if (artist.genreRelevance < 60) {
    rejectedReason = "genre_relevance_below_60";
  }

  return {
    artistName: artist.name,
    bookingCategory: artist.bookingCategory ?? null,
    genreRelevance: artist.genreRelevance ?? null,
    estimatedFollowers: artist.estimatedFollowers ?? null,
    artistTier: artist.artistTier ?? null,
    rejectedReason
  };
}

export function selectEligibleSimilarArtistsForBookingVenueDiscovery(
  artists: SimilarArtist[],
  limit: number
): { artists: SimilarArtist[]; diagnostics: SimilarArtistEligibilityDiagnostic[] } {
  const diagnostics = artists.map(explainSimilarArtistVenueEligibility);
  const selected = artists
    .filter(isEligibleSimilarArtistForBookingVenueDiscovery)
    .sort((left, right) => {
      const leftScore = left.genreRelevance + left.totalRelevance + categoryBonus(left.bookingCategory);
      const rightScore = right.genreRelevance + right.totalRelevance + categoryBonus(right.bookingCategory);
      if (rightScore !== leftScore) return rightScore - leftScore;
      return left.name.localeCompare(right.name);
    })
    .slice(0, Math.max(0, limit));

  return { artists: selected, diagnostics };
}

function categoryBonus(category: string): number {
  if (category === "regional_peer") return 20;
  if (category === "support_target") return 15;
  return 0;
}
