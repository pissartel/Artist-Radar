// Issue #142: Chartmetric artist-audience enrichment, phase 1.
//
// Chartmetric is billed through API credits, so this integration is
// deliberately narrow: it only resolves a Chartmetric artist identity and
// retrieves Spotify monthly listeners / followers (plus optional short
// history when explicitly requested). Playlist activity, geographic
// audience data, full social analytics and Chartmetric similar artists are
// out of scope for this ticket.

// How confidently the resolved Chartmetric artist matches the artist being
// analyzed. Only "exact" or "high" confidence matches may be merged
// automatically — "medium"/"low" must be skipped rather than risk attaching
// another artist's data.
export type ArtistMatchConfidence = "exact" | "high" | "medium" | "low";

// Which signal produced the match, in the priority order defined by the
// issue (strongest identifiers first).
export type ArtistMatchMethod =
  | "spotify_id"
  | "spotify_url"
  | "external_id"
  | "name_with_platform_links"
  | "name_with_genre_location";

// Normalized end-to-end outcome of one enrichArtist() call. Every non-happy
// path here corresponds to a safe-fallback requirement from the issue: the
// caller (pipeline) always gets one of these values and never an exception.
export type ChartmetricEnrichmentStatus =
  | "success"
  | "partial"
  | "skipped"
  | "not_found"
  | "ambiguous"
  | "timeout"
  | "rate_limited"
  | "budget_limited"
  | "error";

// Machine-readable reason accompanying a non-"success" status. Free-form
// beyond the known set so a specific failure can still be logged/reported
// without needing to keep this union in lockstep with every internal error.
export type ChartmetricSkipReason =
  | "feature_disabled"
  | "missing_credentials"
  | "remote_flag_unavailable"
  | "low_confidence_match"
  | "ambiguous_candidates"
  | "duplicate_call_prevented"
  | "max_calls_per_analysis_reached"
  | "daily_credit_limit_reached"
  | "monthly_credit_limit_reached"
  | "authentication_error"
  | "malformed_response"
  | "unexpected_error"
  // Issue #201: candidate ranked outside the configurable top-N enriched
  // this analysis run — a cost control, not a match/data failure.
  | "not_selected_for_enrichment"
  | (string & {});

// Minimum audience data required to later compute
// sizeRatio = candidateMonthlyListeners / userMonthlyListeners (issue #142
// section 3). Metrics that Chartmetric doesn't report stay `undefined` —
// never coerced to 0 — so "unavailable" remains distinguishable from "zero".
export interface ChartmetricAudienceMetrics {
  chartmetricArtistId: string;
  spotifyArtistId?: string;
  spotifyMonthlyListeners?: number;
  spotifyFollowers?: number;
  // ISO 8601 timestamp of when Chartmetric measured these values, when the
  // API reports one distinctly from when we fetched them.
  measuredAt?: string;
  // ISO 8601 timestamp of when this process fetched (or cache-served) the
  // data — always present, even on a cache hit.
  fetchedAt: string;
  matchConfidence: ArtistMatchConfidence;
  source: "chartmetric";
}

// One point of the limited recent-history series, only ever populated when
// the caller explicitly opts in via `includeRecentHistory` — the default
// artist-analysis flow never requests this.
export interface ChartmetricHistoryPoint {
  date: string;
  spotifyMonthlyListeners?: number;
  spotifyFollowers?: number;
}

export interface ArtistEnrichmentInput {
  artistName: string;
  spotifyArtistId?: string | null;
  spotifyUrl?: string | null;
  // Other exact platform identifiers already known for this artist (e.g.
  // { musicbrainzId: "..." }), used as matching priority #3.
  externalIds?: Record<string, string>;
  genres?: string[];
  city?: string | null;
  country?: string | null;
  // When true, also fetch a short (~30 day) recent history series. Defaults
  // to false/omitted; only a calling use case that explicitly needs a trend
  // should set this, since it costs additional API credits.
  includeRecentHistory?: boolean;
}

export interface ArtistEnrichmentResult {
  provider: "chartmetric";
  status: ChartmetricEnrichmentStatus;
  reason?: ChartmetricSkipReason;
  matchMethod?: ArtistMatchMethod;
  matchConfidence?: ArtistMatchConfidence;
  metrics?: ChartmetricAudienceMetrics;
  recentHistory?: ChartmetricHistoryPoint[];
  // Credits reported by Chartmetric for this call (when the API reports
  // usage) or our own conservative estimate otherwise — see
  // `creditsEstimated`.
  creditsConsumed?: number;
  creditsEstimated?: boolean;
}

// Generic seam so a future artist-scale service (out of scope for this
// ticket) can depend on an interface rather than the Chartmetric
// implementation directly, and so other enrichment providers can be added
// later without changing call sites.
export interface ArtistEnrichmentProvider {
  enrichArtist(input: ArtistEnrichmentInput): Promise<ArtistEnrichmentResult>;
}

// Issue #201: similar-artist candidates get a wider (still best-effort)
// slice of Chartmetric data than the phase-1 main-artist enrichment above —
// used to separate musical similarity (existing genre/scene scoring) from
// commercial-scale similarity. Every field here follows the same rule as
// ChartmetricAudienceMetrics: absent/unreported means "unavailable", never
// coerced to 0.
export interface ChartmetricSocialAudienceMetrics {
  instagramFollowers?: number;
  tiktokFollowers?: number;
  youtubeSubscribers?: number;
  facebookFollowers?: number;
  twitterFollowers?: number;
}

export interface ChartmetricCandidateMetrics extends ChartmetricAudienceMetrics {
  // Chartmetric's own composite popularity score for the artist (cm_artist_score),
  // when the API reports one.
  chartmetricArtistScore?: number;
  // Percent change in Spotify monthly listeners over the trailing window
  // (see CANDIDATE_GROWTH_WINDOW_DAYS in chartmetric.mapper.ts), positive for growth.
  listenerGrowthPercent?: number;
  // Percent change in Spotify followers over the same trailing window.
  followerGrowthPercent?: number;
  socialAudience?: ChartmetricSocialAudienceMetrics;
  // Discovery-surface signal: how much current playlist placement is driving
  // exposure for this artist. Chartmetric-specific composite, left undefined
  // when the API doesn't report it rather than guessed at.
  playlistReachScore?: number;
  totalCurrentPlaylists?: number;
  // Chartmetric's own artist-to-artist relationship score between this
  // candidate and the main analyzed artist, only populated when Chartmetric's
  // similar-artists endpoint reports the main artist among this candidate's
  // (or vice versa) neighbours.
  neighbouringArtistScore?: number;
}

// One candidate's end-to-end Chartmetric enrichment outcome. Mirrors
// ArtistEnrichmentResult's shape/guarantees (never thrown, always one of
// these statuses) but is keyed to a specific similar-artist candidate rather
// than the single main-artist call.
export interface SimilarArtistCandidateEnrichmentResult {
  provider: "chartmetric";
  candidateName: string;
  status: ChartmetricEnrichmentStatus;
  reason?: ChartmetricSkipReason;
  matchMethod?: ArtistMatchMethod;
  matchConfidence?: ArtistMatchConfidence;
  metrics?: ChartmetricCandidateMetrics;
  // Issue #201 diagnostics: whether the identity match was served from
  // ChartmetricIdentityCache instead of a fresh API call. Undefined when the
  // candidate never reached the identity-lookup step at all (e.g. skipped
  // before enrichment was attempted).
  cacheHit?: boolean;
}
