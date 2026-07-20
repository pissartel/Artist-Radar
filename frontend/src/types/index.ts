// Dashboard API-aligned types
export type PlatformType = "spotify" | "instagram" | "youtube" | "website";

export interface Platform {
  type: PlatformType;
  url?: string;
}

// Raw Spotify metadata for an artist, as fetched by the backend enrichment
// step. Populated only when a confident Spotify match was found.
export interface SpotifyMetadata {
  id: string;
  url: string | null;
  imageUrl: string | null;
  followers: number | null;
  popularity: number | null;
  genres: string[];
}

// Where the generic artist image came from. Spotify is the preferred source
// today, but the UI should not assume it: other trusted providers can be
// added on the backend without any frontend change.
export type ImageSource =
  | "spotify"
  | "lastfm"
  | "musicbrainz"
  | "website"
  | "manual"
  | "fallback"
  | null;

// Compact artist/audience metrics for the Insights panel. Fields are null
// when the underlying data isn't available (e.g. no Spotify data collected) —
// never fabricated.
export interface ArtistMetrics {
  monthlyListeners: number | null;
  followers: number | null;
  popularityScore: number | null;
  mainGenre: string | null;
  spotifyUrl: string | null;
}

export interface ArtistProfile {
  id: string;
  name: string;
  genres: string[];
  location: string;
  city: string;
  country: string;
  monthlyListeners: number;
  growthPercent: number;
  imageUrl?: string;
  imageSource?: ImageSource;
  imageConfidence?: number | null;
  verified?: boolean;
  platforms?: Platform[];
  spotify?: SpotifyMetadata;
  metrics?: ArtistMetrics;
}

export interface KpiMetric {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
}

export type ArtistTier = "emerging" | "rising" | "established" | "headliner";

export interface SimilarArtist {
  id: string;
  name: string;
  genres: string[];
  location: string;
  matchScore: number;
  reason?: string;
  artistTier?: ArtistTier;
  platforms?: Platform[];
  imageUrl?: string;
  imageSource?: ImageSource;
  imageConfidence?: number | null;
  monthlyListeners?: number;
  spotify?: SpotifyMetadata;
  // Future fields expected from the similar-artist pipeline (not yet populated in V1):
  matchReasons?: string[];
  sharedGenres?: string[];
  sourceUrls?: string[];
  relatedVenues?: string[];
}

// V1 scope: booking opportunities only.
// Future opportunity categories (not yet exposed in the UI):
// | "playlist"
// | "label"
// | "blog"
// | "creative_provider"
// | "mixing_engineer"
// | "video_director"
export type OpportunityType = "venue" | "concert" | "opening_slot" | "festival" | "organization";

// Reliable booking category inferred by the backend mapper from opportunity
// type, source metadata, and title. Used by frontend filters (booking tabs,
// explorer). "unknown" is kept only when classification isn't possible.
export type OpportunityCategory =
  | "concert"
  | "venue"
  | "festival"
  | "opening_slot"
  | "organization"
  | "contact"
  | "unknown";

export interface OpportunityRelatedArtist {
  name: string;
  popularityComparison: string;
  matchedGenres: string[];
}

// Structured match factors from the backend (issue #130 review feedback).
// The frontend must render these directly and never parse `matchReasons`
// prose to derive "why this matches" copy.
export type MatchFactorCode =
  | "genre_match"
  | "location_match"
  | "date_lead_time"
  | "capacity_fit"
  | "similar_artist_signal"
  | "support_slot_signal"
  | "contact_available"
  | "lineup_availability"
  | "source_confidence"
  | "data_completeness";

export type MatchFactorImpact = "positive" | "negative" | "neutral";

export interface MatchFactor {
  code: MatchFactorCode;
  label: string;
  detail?: string;
  impact: MatchFactorImpact;
  scoreContribution?: number;
}

export interface OpportunityMatchBreakdown {
  overallScore: number;
  positiveFactors: MatchFactor[];
  negativeFactors: MatchFactor[];
  // Missing/unverified information (e.g. "capacity unknown"), distinct from
  // confirmed negative signals like a genre mismatch.
  neutralFactors: MatchFactor[];
}

// Generic entity covering booking opportunities today and future artist
// growth opportunities (labels, playlists, creative providers, ...).
export interface Opportunity {
  id: string;
  type: OpportunityType;
  category: OpportunityCategory;
  title: string;
  // Human-readable source category (e.g. "booking_agency", "open_call"),
  // kept for organization cards where `type` is collapsed to "organization".
  organizationType?: string;
  location: string;
  city?: string;
  country?: string;
  venue?: string;
  date?: string;
  description: string;
  tags: string[];
  matchScore: number;
  matchReasons: string[];
  // Structured positive/negative factors backing matchScore. Prefer this over
  // matchReasons for any user-facing "why this matches" UI.
  matchBreakdown?: OpportunityMatchBreakdown;
  sourceUrls?: string[];
  contact?: string | null;
  // Ticket/booking purchase URL, when a source reports it. Never guessed.
  ticketUrl?: string | null;
  relatedSimilarArtistIds?: string[];
  imageUrl?: string;
  // Genres associated with the venue/festival/organization, or the event's
  // genre fit. Empty when unknown — never guessed.
  genres: string[];
  // Known venue capacity, when a source reports it.
  venueCapacity?: number | null;
  // Past events/programming attributed to this target, when known.
  recentEvents: string[];
  // Full announced lineup (headliner + support), when a source lists it. Never guessed.
  lineup: string[];
  // Present only when this opportunity was surfaced from a similar artist's live history.
  relatedArtist?: OpportunityRelatedArtist | null;
}

export interface BookingSource {
  id: string;
  name: string;
  url?: string;
  type: string;
  opportunityCount?: number;
}

export interface CityOpportunityStat {
  city: string;
  country: string;
  opportunityCount: number;
  topVenueCount: number;
  percentage?: number;
}

export type MainGoal =
  | "booking_opportunities"
  | "similar_artists"
  | "opening_slots"
  | "small_tour";

export interface OnboardingFormData {
  artistName: string;
  spotifyUrl: string;
  youtubeUrl: string;
  instagramUrl: string;
  websiteUrl: string;
  countryOfOrigin: string;
  city: string;
  mainGenre: string;
  secondaryGenres: string;
  targetLocation: string;
  mainGoal: MainGoal;
}

export interface DashboardData {
  artist: ArtistProfile;
  kpis: KpiMetric[];
  similarArtists: SimilarArtist[];
  bookingOpportunities: Opportunity[];
  topCities: CityOpportunityStat[];
  sources: BookingSource[];
}
