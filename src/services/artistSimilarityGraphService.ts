import type { ArtistProfile, SimilarArtist } from "../schemas.js";
import { debugLog, warnLog } from "../utils/logger.js";

export const SIMILARITY_SCORE_VERSION = "similarity-v1";

export interface CanonicalArtistIdentity {
  name: string;
  spotifyId?: string | null;
  chartmetricId?: string | null;
  musicBrainzId?: string | null;
  deezerId?: string | null;
  genres?: string[];
  city?: string | null;
  country?: string | null;
  scaleBand?: string | null;
  profileData?: Record<string, unknown>;
}

export interface PersistedSimilarityEdge {
  artistId: string;
  similarArtistId: string;
  score: number;
  scoreVersion: string;
  genreScore: number | null;
  audienceScore: number | null;
  geographyScore: number | null;
  providerScore: number | null;
  confidence: number;
  sources: string[];
  firstSeenAt: string;
  lastComputedAt: string;
  nextRefreshAt: string;
  result: SimilarArtist;
  reverseResult?: SimilarArtist;
}

export type EncounteredArtistRole =
  | "analyzed_artist"
  | "similar_artist"
  | "concert_artist"
  | "lineup_artist"
  | "headliner"
  | "support"
  | "venue_history_artist";

export interface ArtistObservation {
  role: EncounteredArtistRole;
  sourceProvider: string;
  sourceUrl?: string | null;
  eventExternalId?: string | null;
  eventName?: string | null;
  venueName?: string | null;
  confidence: number;
  observedAt: string;
  evidence?: Record<string, unknown>;
}

export interface SimilarityGraphStore {
  resolveArtist(identity: CanonicalArtistIdentity): Promise<string>;
  readEdges(artistId: string, scoreVersion: string): Promise<PersistedSimilarityEdge[]>;
  hasEdgesForOtherScoreVersion?(artistId: string, scoreVersion: string): Promise<boolean>;
  upsertEdge(edge: Omit<PersistedSimilarityEdge, "firstSeenAt">): Promise<"created" | "recomputed">;
  enqueueRefresh?(artistId: string, reason: "stale" | "sparse" | "score_version"): Promise<void>;
  recordArtistObservation?(artistId: string, observation: ArtistObservation): Promise<void>;
}

export interface SimilarityGraphMetrics {
  dbHit: boolean;
  reusedEdges: number;
  newEdgesCreated: number;
  externalProviderCallsAvoided: number;
  externalProviderCallsPerformed: number;
  staleEdgesRefreshed: number;
  graphCoverage: number;
  duplicateArtistsMerged: number;
  scoreVersion: string;
}

export interface DbFirstSimilarityOptions {
  store: SimilarityGraphStore;
  profile: ArtistProfile;
  discover: () => Promise<SimilarArtist[]>;
  minimumCandidates?: number;
  minimumConfidence?: number;
  scoreVersion?: string;
  edgeTtlDays?: number;
  deepSearch?: boolean;
  now?: Date;
}

export interface DbFirstSimilarityResult {
  artists: SimilarArtist[];
  metrics: SimilarityGraphMetrics;
  source: "db_reused" | "db_stale_reused" | "provider_refreshed";
}

export async function findSimilarArtistsDbFirst(options: DbFirstSimilarityOptions): Promise<DbFirstSimilarityResult> {
  const now = options.now ?? new Date();
  const scoreVersion = options.scoreVersion ?? SIMILARITY_SCORE_VERSION;
  const minimumCandidates = options.minimumCandidates ?? 6;
  const minimumConfidence = options.minimumConfidence ?? 0.55;
  const artistId = await options.store.resolveArtist(profileIdentity(options.profile));
  const edges = await options.store.readEdges(artistId, scoreVersion);
  if (edges.length === 0 && await options.store.hasEdgesForOtherScoreVersion?.(artistId, scoreVersion)) {
    try {
      await options.store.enqueueRefresh?.(artistId, "score_version");
    } catch (error) {
      warnLog("similar-artists", "score-version refresh enqueue failed", { artistId, scoreVersion, error });
    }
  }
  const usable = edges.filter((edge) => edge.confidence >= minimumConfidence);
  const fresh = usable.filter((edge) => Date.parse(edge.nextRefreshAt) > now.getTime());
  const hasCoverage = usable.length >= minimumCandidates && hasSegmentCoverage(usable, options.profile);
  const freshEnough = fresh.length >= minimumCandidates && hasSegmentCoverage(fresh, options.profile);
  const metrics = createMetrics(scoreVersion, usable.length, minimumCandidates);

  if (!options.deepSearch && freshEnough) {
    metrics.dbHit = true;
    metrics.reusedEdges = fresh.length;
    metrics.externalProviderCallsAvoided = 1;
    logGraphResult("db_reused", artistId, metrics);
    return { artists: rankPersistedEdges(fresh), metrics, source: "db_reused" };
  }

  if (!options.deepSearch && hasCoverage) {
    metrics.dbHit = true;
    metrics.reusedEdges = usable.length;
    metrics.externalProviderCallsAvoided = 1;
    try {
      await options.store.enqueueRefresh?.(artistId, "stale");
    } catch (error) {
      warnLog("similar-artists", "similarity background refresh enqueue failed", { artistId, error });
    }
    logGraphResult("db_stale_reused", artistId, metrics);
    return { artists: rankPersistedEdges(usable), metrics, source: "db_stale_reused" };
  }

  metrics.externalProviderCallsPerformed = 1;
  if (usable.length > 0) {
    metrics.reusedEdges = usable.length;
  }

  try {
    const discovered = await options.discover();
    try {
      await persistDiscovery({
        store: options.store,
        artistId,
        profile: options.profile,
        artists: discovered,
        scoreVersion,
        edgeTtlDays: options.edgeTtlDays ?? 14,
        now,
        metrics
      });
    } catch (error) {
      // Provider discovery already succeeded. Persistence is additive and
      // must not turn a usable result into a second expensive provider run.
      warnLog("similar-artists", "similarity graph persistence failed; returning discovered artists", {
        artistId,
        error
      });
    }
    const merged = mergeArtists(discovered, rankPersistedEdges(usable));
    if (merged.length < minimumCandidates) {
      try {
        await options.store.enqueueRefresh?.(artistId, "sparse");
      } catch (error) {
        warnLog("similar-artists", "sparse graph expansion enqueue failed", { artistId, error });
      }
    }
    logGraphResult("provider_refreshed", artistId, metrics);
    return { artists: merged, metrics, source: "provider_refreshed" };
  } catch (error) {
    try {
      await options.store.enqueueRefresh?.(artistId, "sparse");
    } catch (enqueueError) {
      warnLog("similar-artists", "provider failure cooldown enqueue failed", { artistId, enqueueError });
    }
    if (usable.length > 0) {
      warnLog("similar-artists", "provider refresh failed; reusing persisted similarity edges", {
        artistId,
        reusedEdges: usable.length,
        error
      });
      return { artists: rankPersistedEdges(usable), metrics, source: "db_stale_reused" };
    }
    throw error;
  }
}

interface PersistDiscoveryInput {
  store: SimilarityGraphStore;
  artistId: string;
  profile: ArtistProfile;
  artists: SimilarArtist[];
  scoreVersion: string;
  edgeTtlDays: number;
  now: Date;
  metrics: SimilarityGraphMetrics;
}

async function persistDiscovery(input: PersistDiscoveryInput): Promise<void> {
  const nextRefreshAt = new Date(input.now.getTime() + input.edgeTtlDays * 86_400_000).toISOString();
  const uniqueArtists = deduplicateArtists(input.artists);
  input.metrics.duplicateArtistsMerged += input.artists.length - uniqueArtists.length;
  for (const artist of uniqueArtists) {
    const similarArtistId = await input.store.resolveArtist(similarArtistIdentity(artist));
    if (similarArtistId === input.artistId) continue;
    const status = await input.store.upsertEdge({
      artistId: input.artistId,
      similarArtistId,
      score: artist.totalRelevance,
      scoreVersion: input.scoreVersion,
      genreScore: artist.genreRelevance,
      audienceScore: artist.sizeRelevance,
      geographyScore: artist.localRelevance,
      providerScore: Math.round((artist.sourceConfidence ?? artist.confidence) * 100),
      confidence: artist.confidence,
      sources: unique([artist.source, ...artist.sources]),
      lastComputedAt: input.now.toISOString(),
      nextRefreshAt,
      result: artist,
      reverseResult: profileAsSimilarArtist(input.profile, artist)
    });
    if (status === "created") input.metrics.newEdgesCreated += 1;
    else input.metrics.staleEdgesRefreshed += 1;
    debugLog("similar-artists", status === "created" ? "new_edge_discovered" : "edge_recomputed", {
      artistId: input.artistId,
      similarArtistId,
      scoreVersion: input.scoreVersion
    });
  }
}

function deduplicateArtists(artists: SimilarArtist[]): SimilarArtist[] {
  const seen = new Set<string>();
  return artists.filter((artist) => {
    const key = artist.spotifyId ?? artist.spotify?.id ?? normalizeArtistName(artist.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function profileIdentity(profile: ArtistProfile): CanonicalArtistIdentity {
  return {
    name: profile.spotifyArtistName ?? profile.artistName ?? "Unknown artist",
    spotifyId: profile.spotify?.id ?? null,
    deezerId: externalIdFromUrl(profile.socialLinks.deezerUrl, "artist"),
    genres: profile.genres,
    city: profile.city,
    country: profile.country,
    profileData: { spotify: profile.spotify, platformStats: profile.platformStats }
  };
}

function externalIdFromUrl(value: string | null | undefined, marker: string): string | null {
  if (!value) return null;
  try {
    const parts = new URL(value).pathname.split("/").filter(Boolean);
    const markerIndex = parts.findIndex((part) => part.toLowerCase() === marker);
    return markerIndex >= 0 ? parts[markerIndex + 1] ?? null : null;
  } catch {
    return null;
  }
}

function similarArtistIdentity(artist: SimilarArtist): CanonicalArtistIdentity {
  return {
    name: artist.name,
    spotifyId: artist.spotifyId ?? artist.spotify?.id ?? null,
    chartmetricId: artist.chartmetric?.metrics?.chartmetricArtistId ?? null,
    musicBrainzId: evidenceExternalId(artist, "musicbrainz"),
    genres: artist.genres,
    city: artist.city,
    country: artist.country,
    scaleBand: artist.artistScaleBand ?? artist.artistTier,
    profileData: { spotify: artist.spotify, popularity: artist.popularity }
  };
}

function profileAsSimilarArtist(profile: ArtistProfile, relationship: SimilarArtist): SimilarArtist {
  const followers = profile.platformStats.spotifyFollowers ?? profile.spotify?.followers ?? null;
  const popularity = profile.platformStats.spotifyPopularity ?? profile.spotify?.popularity ?? null;
  return {
    name: profile.spotifyArtistName ?? profile.artistName ?? "Unknown artist",
    url: profile.socialLinks.spotifyUrl ?? null,
    spotifyUrl: profile.socialLinks.spotifyUrl ?? null,
    spotifyId: profile.spotify?.id ?? null,
    genres: profile.genres,
    city: profile.city ?? null,
    country: profile.country ?? null,
    source: "spotify_search",
    sources: ["similarity_graph"],
    reason: "Known neighbor in the shared artist-similarity graph.",
    confidence: profile.confidence,
    sourceConfidence: profile.confidence,
    artistTier: relationship.artistTier,
    bookingCategory: relationship.bookingCategory,
    estimatedFollowers: followers,
    estimatedPopularity: popularity,
    sizeSignalSource: profile.spotify ? "spotify_artist" : "unknown",
    genreRelevance: relationship.genreRelevance,
    localRelevance: relationship.localRelevance,
    sizeRelevance: relationship.sizeRelevance,
    sceneRelevance: relationship.sceneRelevance,
    totalRelevance: relationship.totalRelevance,
    relevanceToUserArtist: relationship.relevanceToUserArtist,
    possibleUse: "booking_research",
    estimatedLevel: profile.estimatedLevel,
    evidenceNotes: ["Reused from a reverse shared-graph edge."],
    sourceUrls: [],
    genreEvidence: [],
    locationEvidence: [],
    sizeEvidence: [],
    verificationStatus: "needs_verification",
    popularity: {
      estimatedLevel: "unknown",
      confidence: profile.confidence,
      sizeSignalSource: profile.spotify ? "spotify" : "unknown",
      platforms: {}
    },
    discardedTags: [],
    spotify: profile.spotify,
    imageUrl: profile.imageUrl,
    imageSource: profile.imageSource,
    imageConfidence: profile.imageConfidence
  };
}

function evidenceExternalId(artist: SimilarArtist, provider: string): string | null {
  const entry = artist.genreEvidence.find((evidence) => evidence.source.toLowerCase() === provider);
  if (!entry?.sourceUrl) return null;
  return entry.sourceUrl.split("/").filter(Boolean).at(-1) ?? null;
}

function rankPersistedEdges(edges: PersistedSimilarityEdge[]): SimilarArtist[] {
  return [...edges].sort((a, b) => b.score - a.score).map((edge) => edge.result);
}

function hasSegmentCoverage(edges: PersistedSimilarityEdge[], profile: ArtistProfile): boolean {
  const artists = edges.map((edge) => edge.result);
  const hasComparable = artists.some((artist) => artist.artistTier === "small" || artist.bookingCategory === "local_peer" || artist.bookingCategory === "regional_peer");
  const hasMedium = artists.some((artist) => artist.artistTier === "medium" || artist.bookingCategory === "support_target");
  const hasLarge = artists.some((artist) => artist.artistTier === "large" || artist.bookingCategory === "reference");
  const requestedLocation = normalizeLocation(profile.city) ?? normalizeLocation(profile.country);
  const hasLocal = !requestedLocation || artists.some((artist) =>
    normalizeLocation(artist.city) === requestedLocation || normalizeLocation(artist.country) === requestedLocation
  );
  return hasComparable && hasMedium && hasLarge && hasLocal;
}

function normalizeLocation(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function mergeArtists(primary: SimilarArtist[], fallback: SimilarArtist[]): SimilarArtist[] {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter((artist) => {
    const key = artist.spotifyId ?? normalizeArtistName(artist.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createMetrics(scoreVersion: string, usable: number, minimum: number): SimilarityGraphMetrics {
  return {
    dbHit: false,
    reusedEdges: 0,
    newEdgesCreated: 0,
    externalProviderCallsAvoided: 0,
    externalProviderCallsPerformed: 0,
    staleEdgesRefreshed: 0,
    graphCoverage: Math.min(1, usable / Math.max(1, minimum)),
    duplicateArtistsMerged: 0,
    scoreVersion
  };
}

function logGraphResult(event: string, artistId: string, metrics: SimilarityGraphMetrics): void {
  debugLog("similar-artists", event, { artistId, ...metrics });
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeArtistName(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
