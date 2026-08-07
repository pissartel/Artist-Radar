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
const CHARTMETRIC_RESEARCH_MIN_GENRE_RELEVANCE = 55;
const LASTFM_RESEARCH_MIN_GENRE_RELEVANCE = 75;
const LASTFM_RESEARCH_MIN_SOURCE_CONFIDENCE = 0.85;

export function canGenerateBookingVenue(artist: SimilarArtist): boolean {
  return artist.bookingCategory === "regional_peer" ||
    artist.bookingCategory === "support_target" ||
    isChartmetricBackedResearchCandidate(artist) ||
    isStrongLastFmResearchCandidate(artist);
}

export function isEligibleSimilarArtistForBookingVenueDiscovery(artist: SimilarArtist): boolean {
  if (artist.verificationStatus === "verified" && BOOKING_VENUE_CATEGORIES.has(artist.bookingCategory) && artist.genreRelevance >= 60) {
    return true;
  }

  return isChartmetricBackedResearchCandidate(artist) || isStrongLastFmResearchCandidate(artist);
}

export function explainSimilarArtistVenueEligibility(artist: SimilarArtist): SimilarArtistEligibilityDiagnostic {
  let rejectedReason: string | null = null;
  if (isEligibleSimilarArtistForBookingVenueDiscovery(artist)) {
    rejectedReason = null;
  } else if (artist.verificationStatus !== "verified" && !hasReliableChartmetricAudience(artist) && !hasReliableLastFmResearchSignal(artist)) {
    rejectedReason = "not_verified";
  } else if (!canGenerateBookingVenue(artist)) {
    rejectedReason = artist.bookingCategory === "reference" ? "reference_artist" : "unsupported_booking_category";
  } else if (artist.bookingCategory === "to_verify" && artist.genreRelevance < CHARTMETRIC_RESEARCH_MIN_GENRE_RELEVANCE) {
    rejectedReason = "genre_relevance_below_55";
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
  if (category === "to_verify") return 5;
  return 0;
}

function isChartmetricBackedResearchCandidate(artist: SimilarArtist): boolean {
  return artist.bookingCategory === "to_verify" &&
    artist.genreRelevance >= CHARTMETRIC_RESEARCH_MIN_GENRE_RELEVANCE &&
    hasReliableChartmetricAudience(artist) &&
    (artist.artistTier === "small" || artist.artistTier === "medium" || artist.artistTier === "unknown");
}

function hasReliableChartmetricAudience(artist: SimilarArtist): boolean {
  const chartmetric = artist.chartmetric;
  const metrics = chartmetric?.metrics;
  const hasAudience = metrics?.spotifyFollowers !== undefined || metrics?.spotifyMonthlyListeners !== undefined;
  return chartmetric?.status === "success" &&
    (chartmetric.matchConfidence === "exact" || chartmetric.matchConfidence === "high") &&
    hasAudience;
}

function isStrongLastFmResearchCandidate(artist: SimilarArtist): boolean {
  return artist.bookingCategory === "to_verify" &&
    artist.source === "lastfm_similar" &&
    artist.genreRelevance >= LASTFM_RESEARCH_MIN_GENRE_RELEVANCE &&
    hasReliableLastFmResearchSignal(artist) &&
    (artist.artistTier === "small" || artist.artistTier === "medium");
}

function hasReliableLastFmResearchSignal(artist: SimilarArtist): boolean {
  const hasIdentity = Boolean(artist.spotifyId || artist.spotifyUrl);
  const hasAudience = typeof artist.estimatedFollowers === "number" || artist.popularity.platforms.spotify !== undefined;
  const sourceConfidence = artist.sourceConfidence ?? 0;
  return hasIdentity && hasAudience && sourceConfidence >= LASTFM_RESEARCH_MIN_SOURCE_CONFIDENCE;
}
