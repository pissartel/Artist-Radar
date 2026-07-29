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

// V1 scope: booking opportunities plus labels (issue #197).
// Future opportunity categories (not yet exposed in the UI):
// | "playlist"
// | "blog"
// | "creative_provider"
// | "mixing_engineer"
// | "video_director"
export type OpportunityType = "venue" | "concert" | "opening_slot" | "festival" | "organization" | "label";

// Reliable booking category inferred by the backend mapper from opportunity
// type, source metadata, and title. Used by frontend filters (booking tabs,
// explorer). "unknown" is kept only when classification isn't possible.
export type OpportunityCategory =
  | "concert"
  | "venue"
  | "festival"
  | "opening_slot"
  | "organization"
  | "label"
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

// Support-slot-potential analysis (issue #158): a probability signal, never
// a confirmed fact that a slot is available.
export type SupportSlotStatus = "likely" | "possible" | "unlikely" | "unknown";

export interface SupportSlotPotential {
  status: SupportSlotStatus;
  confidenceScore: number;
  reasons: string[];
}

// Purpose a contact serves, so the detail panel can group contacts instead
// of listing them as one undifferentiated block. "general" is the honest
// default for contacts whose purpose isn't known — never guessed.
export type ContactPurpose =
  | "booking"
  | "management"
  | "press"
  | "submissions"
  | "partnerships"
  | "general";

export interface OpportunityContact {
  purpose: ContactPurpose;
  label: string;
  value: string;
  url?: string;
  // Whether this contact has been confirmed against the source (e.g. listed
  // directly on the venue's own site) rather than merely scraped/guessed.
  verified?: boolean;
  // Where this contact was found (e.g. "Venue website", "Public listing"),
  // shown next to the contact so its trustworthiness is never ambiguous.
  source?: string;
}

// Role identifiable from the source listing itself — never guessed when the
// source doesn't state it (see `getLineupEntries`).
export type LineupPosition = "headliner" | "support" | "opener" | "other";

export interface LineupEntry {
  name: string;
  position?: LineupPosition;
  // Artist's own site/social link, when the source reports one. Never guessed.
  externalUrl?: string;
}

// One piece of evidence backing an opportunity. `sourceUrls` (below) remains
// the minimal fallback; this is the richer shape the detail page prefers
// when the backend provides it.
export interface OpportunitySourceEvidence {
  url: string;
  title?: string;
  // What was retrieved from this source (e.g. "Event date and lineup").
  retrievedInfo?: string;
}

// Label-specific vocabulary (issue #197). A label is not an event: it has no
// concert date, venue capacity, or lineup, so its own data lives in a
// namespaced `labelDetails` group instead of overloading the generic event
// fields below (`date`, `venue`, `venueCapacity`, `lineup`, ...) with
// label meaning.
export type LabelGeographicScope = "local" | "national" | "international" | "remote_compatible" | "unknown";

export type LabelDemoPolicy = "open" | "closed" | "invite_only" | "unknown";

export type LabelEvidenceProvider = "musicbrainz" | "discogs" | "official_website" | "bandcamp" | "web_search";

export interface LabelEvidence {
  provider: LabelEvidenceProvider;
  sourceUrl: string | null;
  similarArtistName?: string | null;
  releaseTitle?: string | null;
  confidence: number;
}

export interface LabelSourceReference {
  name: string;
  url: string | null;
}

export interface LabelOpportunityDetails {
  genres: string[];
  geographicScope: LabelGeographicScope;
  territory: string | null;
  isActive: boolean | null;
  // Reuses ArtistTier's underlying "small" | "medium" | "large" | "unknown"
  // vocabulary (see BackendArtistTier) rather than a separate scale.
  audienceLevel: "small" | "medium" | "large" | "unknown";
  // Similar artists whose releases on this label were actually matched in
  // the source evidence — the compatibility explanation's own roster.
  supportingSimilarArtists: string[];
  demoPolicy: LabelDemoPolicy;
  demoSubmissionUrl: string | null;
  publicContactEmail: string | null;
  contactUrl: string | null;
  distributor: string | null;
  websiteUrl: string | null;
  bandcampUrl: string | null;
  // Deterministically selected per issue #197 (official site > demo page >
  // Bandcamp > social > MusicBrainz/Discogs evidence > discovery source).
  primaryUrl: string | null;
  externalIds?: { musicBrainzId?: string; discogsId?: number };
  evidence: LabelEvidence[];
  sources: LabelSourceReference[];
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
  address?: string;
  // Kind of venue when known (e.g. "venue", "bar", "association", "festival",
  // "cultural_centre"), distinct from the opportunity's own `type`.
  venueType?: string;
  venueWebsite?: string;
  date?: string;
  time?: string;
  deadline?: string;
  description: string;
  tags: string[];
  matchScore: number;
  matchReasons: string[];
  // Structured positive/negative factors backing matchScore. Prefer this over
  // matchReasons for any user-facing "why this matches" UI.
  matchBreakdown?: OpportunityMatchBreakdown;
  // Structured support-slot-potential analysis for concert opportunities
  // (issue #158). Null/absent when this analysis doesn't apply (e.g.
  // festivals). Never implies a slot is confirmed available.
  supportSlotPotential?: SupportSlotPotential | null;
  recommendedAction?: string;
  // Headline act(s) for a live event (concert/festival/opening_slot). The
  // full bill (headliner + support) is carried by `lineup` below.
  headliner?: string[];
  // Roster of artists represented by an organization-type opportunity
  // (label, booker, management, association).
  roster?: string[];
  // Structured line-up (name, position, external link) the detail page
  // prefers over the flat `lineup`/`headliner` strings when available.
  lineupEntries?: LineupEntry[];
  sourceUrls?: string[];
  // Richer per-source evidence the detail page prefers over `sourceUrls`
  // when the backend provides it.
  sourceEvidence?: OpportunitySourceEvidence[];
  // Legacy single free-text contact, kept for backward compatibility.
  // Prefer `contacts` (grouped by purpose) when available.
  contact?: string | null;
  // Ticket/booking purchase URL, when a source reports it. Never guessed.
  ticketUrl?: string | null;
  contacts?: OpportunityContact[];
  metadata?: { label: string; value: string }[];
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
  // Preview/development-only toggle (issue #142); only ever read/rendered
  // when productFeatures.chartmetricToggle is enabled. Left `false` by
  // default so it's a no-op everywhere else.
  useChartmetricEnrichment: boolean;
}

export interface DashboardData {
  artist: ArtistProfile;
  kpis: KpiMetric[];
  similarArtists: SimilarArtist[];
  bookingOpportunities: Opportunity[];
  topCities: CityOpportunityStat[];
  sources: BookingSource[];
}
