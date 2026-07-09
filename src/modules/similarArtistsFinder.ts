import {
  SimilarArtistSchema,
  type ArtistProfile,
  type BookingCategory,
  type ArtistTier,
  type SimilarArtist,
  type SimilarArtistPossibleUse,
  type SimilarArtistSource,
  type SizeSignalSource
} from "../schemas.js";
import {
  extractSpotifyArtistId,
  getSpotifyArtistById,
  getSpotifyRelatedArtists,
  createSpotifyCapabilities,
  searchSpotifyArtists,
  searchSpotifyArtistByName,
  getSeveralSpotifyArtistsByIds,
  type SpotifyCapabilities,
  type SpotifyArtistProfile
} from "../services/spotifyService.js";
import {
  enrichArtistWithMusicBrainz,
  type MusicBrainzArtistMetadata
} from "../services/musicBrainzService.js";
import {
  verifyAndEnrichArtistCandidate,
  type ArtistVerificationResult,
  type ArtistVerificationStatus
} from "../services/artistVerificationService.js";
import type { WebSearchProvider } from "../providers/web/WebSearchProvider.js";
import {
  consolidateArtistCandidate,
  type ArtistConsolidationResult
} from "../services/artistConsolidationService.js";
import type { LastFmArtistInfo } from "../services/lastfmService.js";
import type { YouTubeChannelStats } from "../services/youtubeService.js";
import type { GenreEvidence, LocationEvidence, SizeEvidence } from "../schemas.js";
import type { LastFmSimilarArtist } from "../services/lastfmService.js";
import {
  GENRE_FAMILIES,
  evaluateGenreCompatibility,
  cleanArtistGenres,
  collectGenreGateGenres,
  normalizeGenre
} from "./genreCleaner.js";
import { debugLog, warnLog } from "../utils/logger.js";
import {
  findSeedCandidatesByGenreAndTarget,
  type SeedMatchCandidate,
  type SimilarArtistSeedRecord
} from "./similarArtistSeeds.js";
import { estimateArtistSize } from "./sizeEstimator.js";
import { buildLastFmSimilarArtistProvider } from "../providers/LastFmSimilarArtistProvider.js";

export interface SimilarArtistsFinderInput {
  profile: ArtistProfile;
  target?: string | null;
  genre?: string | null;
  city?: string | null;
  links?: string[];
  userProvidedSimilarArtists?: string[];
  seedCandidates?: SimilarArtistSeedRecord[];
  spotifyRelatedArtists?: (spotifyArtistId: string) => Promise<SpotifyArtistProfile[]>;
  spotifySearch?: (query: string, limit: number) => Promise<SpotifyArtistProfile[]>;
  spotifyArtistById?: (spotifyArtistId: string) => Promise<SpotifyArtistProfile | null>;
  spotifySearchByName?: (name: string) => Promise<SpotifyArtistProfile | null>;
  spotifySeveralArtistsByIds?: (spotifyArtistIds: string[]) => Promise<SpotifyArtistProfile[]>;
  lastfmSimilarArtists?: (artistName: string, limit: number) => Promise<LastFmSimilarArtist[]>;
  lastfmArtistInfo?: (artistName: string) => Promise<LastFmArtistInfo | null>;
  musicBrainzSearch?: (artistName: string) => Promise<MusicBrainzArtistMetadata | null>;
  webSearchProvider?: WebSearchProvider | null;
  youtubeChannelStats?: (youtubeUrl: string) => Promise<YouTubeChannelStats | null>;
  env?: {
    MOCK_AI?: string;
    DEBUG_SIMILAR_ARTISTS?: string;
    APP_USER_AGENT?: string;
    LASTFM_API_KEY?: string;
    LASTFM_SIMILAR_LIMIT?: string;
    LASTFM_SECOND_DEGREE_ENABLED?: string;
    SPOTIFY_CLIENT_ID?: string;
    SPOTIFY_CLIENT_SECRET?: string;
    ENABLE_SPOTIFY_DEEP_ENRICHMENT?: string;
    ENABLE_SPOTIFY_RELATED_ARTISTS?: string;
    ENABLE_SPOTIFY_TOP_TRACKS?: string;
    VERIFY_SIMILAR_ARTISTS?: string;
    VERIFY_SIMILAR_ARTISTS_LIMIT?: string;
    DEBUG_ARTIST_VERIFICATION?: string;
    CONSOLIDATE_SIMILAR_ARTISTS?: string;
    CONSOLIDATE_SIMILAR_ARTISTS_LIMIT?: string;
    SIMILAR_ARTISTS_OUTPUT_LIMIT?: string;
    SIMILAR_ARTISTS_TO_VERIFY_LIMIT?: string;
    SIMILAR_ARTISTS_PER_GROUP_LIMIT?: string;
    DEBUG_ARTIST_CONSOLIDATION?: string;
    YOUTUBE_API_KEY?: string;
    FIRECRAWL_API_KEY?: string;
    ENABLE_FIRECRAWL_CONSOLIDATION?: string;
    DEBUG_FIRECRAWL?: string;
    DEBUG_WEB_SEARCH?: string;
    TAVILY_API_KEY?: string;
    EXA_API_KEY?: string;
    JINA_API_KEY?: string;
    ENABLE_TAVILY_SEARCH?: string;
    ENABLE_EXA_SEARCH?: string;
    ENABLE_JINA_READER?: string;
    WEB_SEARCH_MAX_QUERIES_PER_CANDIDATE?: string;
    WEB_SEARCH_MAX_RESULTS_PER_QUERY?: string;
    WEB_EXTRACT_MAX_PAGES_PER_CANDIDATE?: string;
    WEB_PROVIDER_DAILY_BUDGET_GUARD?: string;
  };
}

export interface ArtistMetrics {
  followers: number | null;
  popularity: number | null;
  topTrackPopularityMax?: number | null;
  topTrackPopularityAvg?: number | null;
  youtubeSubscribers?: number | null;
  youtubeTotalViews?: number | null;
  youtubeVideoCount?: number | null;
  manualEstimatedTier?: ArtistTier | null;
}

export interface SizeRelevanceResult {
  artistTier: ArtistTier;
  score: number;
  sizeSignalSource: SizeSignalSource;
}

export interface SimilarArtistProvider {
  name: string;
  discover(input: SimilarArtistsFinderInput): Promise<SimilarArtistDiscoveryCandidate[]>;
}

export interface SimilarArtistDiscoveryCandidate {
  name: string;
  genres: string[];
  city: string | null;
  country: string | null;
  url: string | null;
  source: SimilarArtistSource;
  reason: string;
  notes?: string;
  spotifyId?: string | null;
  followersCount?: number | null;
  popularity?: number | null;
  topTrackPopularityMax?: number | null;
  topTrackPopularityAvg?: number | null;
  topTrackCount?: number | null;
  youtubeSubscribers?: number | null;
  youtubeTotalViews?: number | null;
  youtubeVideoCount?: number | null;
  manualEstimatedTier?: ArtistTier | null;
  images?: string[];
  estimatedTier?: ArtistTier | null;
  matchedQuery?: string | null;
  sourceConfidence?: number;
  sizeSignalSource?: SizeSignalSource;
  spotifyUrl?: string | null;
  instagramUrl?: string | null;
  instagramHandle?: string | null;
  youtubeUrl?: string | null;
  youtubeChannelId?: string | null;
  musicBrainzId?: string | null;
  sourceUrls?: string[];
  genreEvidence?: GenreEvidence[];
  locationEvidence?: LocationEvidence[];
  sizeEvidence?: SizeEvidence[];
  discardedTags?: string[];
  verificationStatus?: ArtistVerificationStatus;
  verification?: ArtistVerificationResult;
  consolidation?: ArtistConsolidationResult;
  consolidationSkippedReason?: string | null;
  discoveryIndex?: number;
}

export type SimilarArtistsByTier = Record<BookingCategory, SimilarArtist[]>;

interface SimilarArtistSeed {
  name: string;
  genres: string[];
  city: string | null;
  country: string | null;
  estimatedFollowers: number | null;
  estimatedPopularity: number | null;
}

interface SpotifySearchMatch {
  matchedQuery: string | null;
  searchRelevanceBoost: number;
}

const MIN_GENRE_RELEVANCE = 25;
const MIN_UNKNOWN_GENRE_LASTFM_RELEVANCE = 30;

const MOCK_SIMILAR_ARTISTS: SimilarArtistSeed[] = [
  {
    name: "Paris Pop Punk Collective",
    genres: ["pop punk", "emo pop"],
    city: "Paris",
    country: "France",
    estimatedFollowers: 900,
    estimatedPopularity: 14
  },
  {
    name: "East Paris Emo Punks",
    genres: ["pop punk", "punk rock"],
    city: "Paris",
    country: "France",
    estimatedFollowers: 1400,
    estimatedPopularity: 16
  },
  {
    name: "Montreuil Punk Rock Friends",
    genres: ["punk rock", "emo"],
    city: "Montreuil",
    country: "France",
    estimatedFollowers: 2100,
    estimatedPopularity: 17
  },
  {
    name: "French Pop Punk Next Step",
    genres: ["pop punk", "alternative rock"],
    city: "Lyon",
    country: "France",
    estimatedFollowers: 8500,
    estimatedPopularity: 32
  },
  {
    name: "Grandes Villes Emo Rock Band",
    genres: ["emo pop", "alternative rock"],
    city: "Bordeaux",
    country: "France",
    estimatedFollowers: 12000,
    estimatedPopularity: 35
  },
  {
    name: "Accessible French Punk Support",
    genres: ["pop punk", "punk rock"],
    city: "Lille",
    country: "France",
    estimatedFollowers: 11000,
    estimatedPopularity: 38
  },
  {
    name: "Major Pop Punk Reference",
    genres: ["pop punk", "punk rock"],
    city: null,
    country: "France",
    estimatedFollowers: 300000,
    estimatedPopularity: 62
  },
  {
    name: "Arena-Level Emo Pop Reference",
    genres: ["emo pop", "pop punk"],
    city: null,
    country: "France",
    estimatedFollowers: 450000,
    estimatedPopularity: 68
  },
  {
    name: "International Punk Rock Benchmark",
    genres: ["punk rock", "alternative rock"],
    city: null,
    country: null,
    estimatedFollowers: 650000,
    estimatedPopularity: 72
  }
];

export async function findSimilarArtists(input: SimilarArtistsFinderInput): Promise<SimilarArtist[]> {
  const env = input.env ?? process.env;
  const userProvided = normalizeUserProvidedArtists(input);
  debugLog("similar-artists", "discovery start", {
    artistName: input.profile.artistName ?? input.profile.spotifyArtistName ?? null,
    genres: input.profile.genres,
    city: input.city ?? input.profile.city ?? null,
    target: input.target ?? null
  });
  debugLog("similar-artists", "MOCK_AI mode", { mockAi: isMockMode(env.MOCK_AI) });

  if (isMockMode(env.MOCK_AI)) {
    const artists = [
      ...userProvided,
      ...MOCK_SIMILAR_ARTISTS.map((artist) => buildMockSimilarArtist(artist, input))
    ].map((artist) => SimilarArtistSchema.parse(artist));
    debugLog("similar-artists", "provider used", { providerUsed: "mock" });
    debugTierCounts(artists);
    return artists;
  }

  const providers: SimilarArtistProvider[] = [
    buildManualSeedProvider(),
    buildLastFmSimilarArtistProvider(env),
    buildSpotifySimilarArtistProvider(env),
    buildWebLocalSceneProvider()
  ];
  debugLog("similar-artists", "providers enabled", {
    lastfm: Boolean(env.LASTFM_API_KEY),
    musicbrainz: true,
    spotify: true,
    seeds: true
  });

  const discovered = await discoverCandidates(input, providers);
  const enriched = await enrichCandidatesWithMusicBrainz(discovered, input, env);
  const consolidated = await consolidateSimilarArtistCandidates(enriched, input, env);
  const verified = await verifySimilarArtistCandidates(consolidated, input, env);
  const artists = rankDiscoveryCandidates(verified, input, userProvided);
  const spotifyEnriched = await enrichSimilarArtistsWithSpotify(artists, input);
  debugTierCounts(spotifyEnriched);
  return spotifyEnriched;
}

// Caps the number of "search by exact name" lookups so a large similar-artist
// list can't trigger dozens of extra Spotify API calls in one analysis run.
const MAX_SPOTIFY_NAME_SEARCH_LOOKUPS = 10;

async function enrichSimilarArtistsWithSpotify(
  artists: SimilarArtist[],
  input: SimilarArtistsFinderInput
): Promise<SimilarArtist[]> {
  const env = input.env ?? process.env;
  if (isMockMode(env.MOCK_AI)) {
    return artists;
  }

  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    debugLog("spotify", "similar artist Spotify enrichment skipped", {
      reason: "missing Spotify credentials"
    });
    return artists;
  }

  const severalByIds = input.spotifySeveralArtistsByIds ?? ((ids: string[]) => getSeveralSpotifyArtistsByIds(ids, env));
  const searchByName = input.spotifySearchByName ?? ((name: string) => searchSpotifyArtistByName(name, env));

  // Cache keyed by Spotify artist ID so an artist referenced twice (e.g. once
  // with an ID and once resolved by name to the same ID) is only fetched once.
  const profileById = new Map<string, SpotifyArtistProfile>();
  const idByArtistName = new Map<string, string>();

  for (const artist of artists) {
    const id = artist.spotifyId?.trim() || (artist.spotifyUrl ? extractSpotifyArtistId(artist.spotifyUrl) : null);
    if (id) {
      idByArtistName.set(artist.name, id);
    }
  }

  const idsToFetch = Array.from(new Set(idByArtistName.values()));
  if (idsToFetch.length > 0) {
    try {
      const profiles = await severalByIds(idsToFetch);
      for (const profile of profiles) {
        profileById.set(profile.id, profile);
      }
    } catch (error) {
      warnLog("spotify", "Batch Spotify artist lookup failed for similar artists.", {
        idsRequested: idsToFetch.length,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  let nameSearchLookups = 0;
  const enriched: SimilarArtist[] = [];
  for (const artist of artists) {
    const knownId = idByArtistName.get(artist.name);
    let profile = knownId ? profileById.get(knownId) ?? null : null;

    if (!profile && !knownId && nameSearchLookups < MAX_SPOTIFY_NAME_SEARCH_LOOKUPS) {
      nameSearchLookups += 1;
      try {
        profile = await searchByName(artist.name);
      } catch (error) {
        warnLog("spotify", "Spotify search-by-name lookup failed for a similar artist.", {
          artistName: artist.name,
          error: error instanceof Error ? error.message : String(error)
        });
        profile = null;
      }
    }

    enriched.push({ ...artist, spotify: profile ? toSpotifyMetadata(profile) : null });
  }

  return enriched;
}

function toSpotifyMetadata(profile: SpotifyArtistProfile): SimilarArtist["spotify"] {
  return {
    id: profile.id,
    url: profile.spotifyUrl,
    imageUrl: profile.images[0] ?? null,
    followers: profile.followers,
    popularity: profile.popularity,
    genres: profile.genres
  };
}

export function groupSimilarArtistsByTier(similarArtists: SimilarArtist[]): SimilarArtistsByTier {
  return similarArtists.reduce<SimilarArtistsByTier>(
    (groups, artist) => {
      groups[artist.bookingCategory].push(artist);
      return groups;
    },
    { local_peer: [], regional_peer: [], support_target: [], reference: [], to_verify: [], unknown: [] }
  );
}

async function discoverCandidates(
  input: SimilarArtistsFinderInput,
  providers: SimilarArtistProvider[]
): Promise<SimilarArtistDiscoveryCandidate[]> {
  const discoveredByProvider = await Promise.all(
    providers.map(async (provider) => {
      const candidates = await provider.discover(input);
      debugLog("similar-artists", "provider candidate count", {
        provider: provider.name,
        count: candidates.length
      });
      return { provider: provider.name, candidates };
    })
  );

  const flatCandidates = discoveredByProvider.flatMap((entry) => entry.candidates);
  const indexedCandidates = flatCandidates.map((candidate, index) => ({ ...candidate, discoveryIndex: index }));
  debugLog("similar-artists", "Broad Peak Last.fm trace", {
    returnedByLastFm: discoveredByProvider
      .find((entry) => entry.provider === "lastfm_similar")
      ?.candidates.some((candidate) => isBroadPeakCandidate(candidate.name)) ?? false
  });
  debugLog("similar-artists", "provider results", {
    lastfmCount: discoveredByProvider.find((entry) => entry.provider === "lastfm_similar")?.candidates.length ?? 0,
    spotifyCount: discoveredByProvider.find((entry) => entry.provider === "spotify_search")?.candidates.length ?? 0,
    seedCount: discoveredByProvider.find((entry) => entry.provider === "manual_seed")?.candidates.length ?? 0,
    musicBrainzEnrichedCount: 0
  });
  debugLog("similar-artists", "candidate count before dedupe", { before: flatCandidates.length });

  debugLog("similar-artists", "total candidates before consolidation", {
    count: indexedCandidates.length
  });

  const badFrequenciesInitial = indexedCandidates.find((candidate) => isBadFrequenciesCandidate(candidate.name));
  if (badFrequenciesInitial) {
    debugLog("similar-artists", "Bad Frequencies initial trace", {
      initialIndex: badFrequenciesInitial.discoveryIndex,
      source: badFrequenciesInitial.source,
      genres: badFrequenciesInitial.genres,
      country: badFrequenciesInitial.country
    });
  }

  const deduped = dedupeDiscoveryCandidates(indexedCandidates, input.profile);
  debugLog("similar-artists", "Broad Peak dedupe trace", {
    beforeDedupe: flatCandidates.some((candidate) => isBroadPeakCandidate(candidate.name)),
    afterDedupe: deduped.some((candidate) => isBroadPeakCandidate(candidate.name))
  });
  debugLog("similar-artists", "dedupe summary", {
    before: flatCandidates.length,
    after: deduped.length,
    duplicatesRemoved: flatCandidates.length - deduped.length
  });
  return deduped;
}

async function enrichCandidatesWithMusicBrainz(
  candidates: SimilarArtistDiscoveryCandidate[],
  input: SimilarArtistsFinderInput,
  env: SimilarArtistsFinderInput["env"]
): Promise<SimilarArtistDiscoveryCandidate[]> {
  if (isTestMode(env) && !input.musicBrainzSearch) {
    debugLog("musicbrainz", "MusicBrainz enrichment skipped in test mode", {
      reason: "no injected musicBrainzSearch helper"
    });
    return candidates;
  }

  const cache = new Map<string, Promise<MusicBrainzArtistMetadata | null>>();
  const enriched: SimilarArtistDiscoveryCandidate[] = [];
  let lookupCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let countryKnownCount = 0;
  let tagsKnownCount = 0;
  const musicBrainzSearch =
    input.musicBrainzSearch ?? ((artistName: string) => enrichArtistWithMusicBrainz(artistName, env));
  let attemptedLookups = 0;

  for (const candidate of candidates) {
    if (!shouldAttemptMusicBrainzEnrichment(candidate)) {
      enriched.push(candidate);
      continue;
    }

    if (attemptedLookups >= 5) {
      debugLog("musicbrainz", "MusicBrainz enrichment skipped", {
        name: candidate.name,
        reason: "lookup limit reached"
      });
      enriched.push(candidate);
      continue;
    }

    const cacheKey = normalizeComparableName(candidate.name);
    if (!cache.has(cacheKey)) {
      lookupCount += 1;
      cache.set(cacheKey, musicBrainzSearch(candidate.name));
    }

    attemptedLookups += 1;
    const metadata = await cache.get(cacheKey);
    if (!metadata) {
      failureCount += 1;
      debugLog("musicbrainz", "MusicBrainz enrichment failed", {
        name: candidate.name
      });
      enriched.push(candidate);
      continue;
    }

    successCount += 1;
    const merged = mergeMusicBrainzMetadata(candidate, metadata, input);
    if (merged.country) {
      countryKnownCount += 1;
    }
    if (merged.genres.length > 0) {
      tagsKnownCount += 1;
    }
    debugLog("musicbrainz", "MusicBrainz enrichment result", {
      name: candidate.name,
      musicBrainzId: metadata.musicBrainzId,
      country: merged.country,
      tagsCount: merged.genres.length,
      lookupSucceeded: true
    });
    enriched.push(merged);
  }

  debugLog("musicbrainz", "MusicBrainz lookup summary", {
    musicBrainzAttempted: lookupCount,
    musicBrainzSucceeded: successCount,
    musicBrainzFailed: failureCount,
    countryKnownCount,
    tagsKnownCount
  });

  return enriched;
}

function dedupeDiscoveryCandidates(
  candidates: SimilarArtistDiscoveryCandidate[],
  profile: ArtistProfile
): SimilarArtistDiscoveryCandidate[] {
  const seenSpotifyIds = new Set<string>();
  const seenNames = new Set<string>();
  return candidates.filter((candidate) => {
    const normalizedName = normalizeComparableName(candidate.name);
    const candidateSpotifyId = candidate.spotifyId?.trim() ?? null;
    if (isUserArtistDiscoveryCandidate(candidate, profile)) {
      return false;
    }

    if (candidateSpotifyId && seenSpotifyIds.has(candidateSpotifyId)) {
      return false;
    }

    if (seenNames.has(normalizedName)) {
      return false;
    }

    if (candidateSpotifyId) {
      seenSpotifyIds.add(candidateSpotifyId);
    }
    seenNames.add(normalizedName);
    return true;
  });
}

function rankDiscoveryCandidates(
  candidates: SimilarArtistDiscoveryCandidate[],
  input: SimilarArtistsFinderInput,
  userProvided: SimilarArtist[]
): SimilarArtist[] {
  const scored = candidates.map((candidate) => scoreDiscoveryCandidate(candidate, input));
  const kept = scored.filter((candidate) => candidate.shouldKeep);
  const rejected = scored.filter((candidate) => !candidate.shouldKeep);
  const broadPeakScored = scored.find((candidate) => isBroadPeakCandidate(candidate.artist.name));
  if (broadPeakScored) {
    debugLog("similar-artists", "Broad Peak scoring trace", {
      kept: broadPeakScored.shouldKeep,
      rejectionReason: broadPeakScored.rejectionReason,
      bookingCategory: broadPeakScored.artist.bookingCategory,
      totalRelevance: broadPeakScored.artist.totalRelevance,
      genres: broadPeakScored.artist.genres,
      country: broadPeakScored.artist.country
    });
  }

  debugLog("similar-artists", "scoring summary", {
    candidatesScored: scored.length,
    rejectedCount: rejected.length,
    keptCount: kept.length
  });

  debugLog("similar-artists", "top rejected candidates", rejected.slice(0, 10).map(logDiscoveryCandidate));
  debugLog("similar-artists", "top kept candidates", kept.slice(0, 10).map(logDiscoveryCandidate));
  debugLog("similar-artists", "candidates kept in to_verify", kept.filter((candidate) => candidate.artist.bookingCategory === "to_verify").map(logDiscoveryCandidate));
  debugLog("similar-artists", "candidates promoted", kept.filter((candidate) => candidate.artist.bookingCategory !== "to_verify" && candidate.artist.bookingCategory !== "unknown").map(logDiscoveryCandidate));
  debugLog("similar-artists", "candidates rejected", rejected.map(logDiscoveryCandidate));

  const badFrequenciesScored = scored.find((candidate) => isBadFrequenciesCandidate(candidate.artist.name));
  if (badFrequenciesScored) {
    debugLog("similar-artists", "Bad Frequencies scoring trace", {
      initialIndex: candidates.find((candidate) => isBadFrequenciesCandidate(candidate.name))?.discoveryIndex,
      kept: badFrequenciesScored.shouldKeep,
      rejectionReason: badFrequenciesScored.rejectionReason,
      genreCompatibility: evaluateGenreCompatibility(collectUserGenres(input), badFrequenciesScored.artist.genres),
      finalScore: badFrequenciesScored.artist.totalRelevance,
      bookingCategory: badFrequenciesScored.artist.bookingCategory,
      verificationStatus: badFrequenciesScored.artist.verificationStatus,
      genres: badFrequenciesScored.artist.genres
    });
  }

  const sorted = [...userProvided, ...kept.map((candidate) => candidate.artist)]
    .sort(compareSimilarArtistsForOutput);
  const { finalArtists, pruned } = pruneSimilarArtistsForOutput(sorted, input.env);
  const finalGroups = groupSimilarArtistsByTier(finalArtists);

  debugLog("similar-artists", "final group counts", getGroupCounts(finalGroups));
  debugLog("similar-artists", "final group names", getGroupNames(finalGroups));
  const broadPeakFinalGroup = findArtistGroup(finalGroups, "Broad Peak");
  if (broadPeakScored || broadPeakFinalGroup) {
    debugLog("similar-artists", "Broad Peak final trace", {
      finalGroup: broadPeakFinalGroup,
      keptInFinalOutput: Boolean(broadPeakFinalGroup)
    });
  }
  const badFrequenciesFinalGroup = findArtistGroup(finalGroups, "Bad Frequencies");
  if (badFrequenciesScored || badFrequenciesFinalGroup) {
    debugLog("similar-artists", "Bad Frequencies final trace", {
      finalGroup: badFrequenciesFinalGroup,
      keptInFinalOutput: Boolean(badFrequenciesFinalGroup),
      removalReason: pruned.find((entry) => isBadFrequenciesCandidate(entry.artist.name))?.reason ?? null
    });
  }
  debugLog("similar-artists", "candidates pruned from final output", pruned.map((entry) => ({
    name: entry.artist.name,
    source: entry.artist.source,
    sources: entry.artist.sources,
    totalRelevance: entry.artist.totalRelevance,
    bookingCategory: entry.artist.bookingCategory,
    reason: entry.reason
  })));

  return finalArtists;
}

interface ScoredDiscoveryCandidate {
  artist: SimilarArtist;
  shouldKeep: boolean;
  matchedQuery: string | null;
  sourceConfidence: number;
  rejectionReason: string | null;
}

function scoreDiscoveryCandidate(
  candidate: SimilarArtistDiscoveryCandidate,
  input: SimilarArtistsFinderInput
): ScoredDiscoveryCandidate {
  const userGenres = collectUserGenres(input);
  const genreCleaningContext = buildGenreCleaningContext(input);
  const cleanedGenreResult = cleanArtistGenres(candidate.genres, userGenres, genreCleaningContext);
  const candidateGenres = cleanedGenreResult.genres;
  const genreGateGenres = collectGenreGateGenres(candidate.genres, candidateGenres, genreCleaningContext);
  const genreCompatibility = evaluateGenreCompatibility(userGenres, genreGateGenres);
  if (isBroadPeakCandidate(candidate.name)) {
    debugLog("similar-artists", "Broad Peak genre cleaning trace", {
      genresBeforeCleaning: candidate.genres,
      genresAfterCleaning: candidateGenres,
      genreGateGenres,
      compatibilityDecision: genreCompatibility
    });
  }
  const discardedTags = uniqueStrings([...(candidate.discardedTags ?? []), ...cleanedGenreResult.discardedTags]);
  const baseGenreRelevance = scoreGenreRelevanceWithContext(userGenres, candidateGenres, candidate.name, candidate.matchedQuery);
  const adjustedBaseGenreRelevance = genreCompatibility.level === "insufficient_evidence"
    ? Math.min(baseGenreRelevance, 35)
    : genreCompatibility.level === "weak_broad_match"
      ? Math.min(baseGenreRelevance, 55)
      : baseGenreRelevance;
  const genreRelevance = candidate.source === "lastfm_similar" && candidateGenres.length === 0
    ? Math.max(baseGenreRelevance, MIN_UNKNOWN_GENRE_LASTFM_RELEVANCE)
    : adjustedBaseGenreRelevance;
  const size = scoreDiscoverySizeRelevance(getUserMetrics(input.profile), candidate);
  let artistTier = size.artistTier;
  let sizeScore = size.score;
  let sizeSignalSource = size.sizeSignalSource;

  if (artistTier === "unknown" && candidate.estimatedTier && candidate.estimatedTier !== "unknown") {
    artistTier = candidate.estimatedTier;
    sizeScore = scoreForTier(candidate.estimatedTier);
    sizeSignalSource = "manual";
  }

  const sceneRelevance = scoreSceneRelevance({ city: candidate.city, country: candidate.country }, input.target, input.city);
  const sourceConfidence = clampScore(Math.round((candidate.sourceConfidence ?? defaultSourceConfidence(candidate.source)) * 100));
  const verificationStatus = candidate.verificationStatus ?? inferVerificationStatus(candidate);
  let bookingCategory = applyVerificationBookingCategory(
    determineBookingCategory(candidate, artistTier, genreRelevance, sceneRelevance, input),
    verificationStatus,
    genreRelevance,
    sceneRelevance
  );
  if (candidate.source === "lastfm_similar" && ["unknown", "insufficient_evidence", "weak_broad_match"].includes(genreCompatibility.level)) {
    bookingCategory = "to_verify";
  }
  const sources = uniqueStrings([candidate.source, ...(candidate.notes ? ["musicbrainz"] : [])]);
  const evidenceNotes = uniqueStrings([
    candidate.reason,
    candidate.notes ?? "",
    ...(candidate.verification?.evidenceNotes ?? []),
    candidate.matchedQuery ? `Matched query: ${candidate.matchedQuery}` : "",
    candidate.country ? `Country: ${candidate.country}` : "",
    candidate.city ? `City: ${candidate.city}` : ""
  ]);
  const evidenceBoost = verificationStatus === "verified" ? 8 : verificationStatus === "needs_verification" ? 2 : -8;
  const totalRelevance = calculateTotalRelevance(
    genreRelevance,
    sizeScore,
    sceneRelevance,
    candidate.source,
    clampScore(sourceConfidence + evidenceBoost)
  );
  const possibleUse = possibleUseForBookingCategory(bookingCategory, artistTier, sceneRelevance);
  const artist = SimilarArtistSchema.parse({
    name: candidate.name,
    url: candidate.url ?? candidate.spotifyUrl ?? candidate.instagramUrl ?? candidate.youtubeUrl ?? null,
    spotifyUrl: candidate.spotifyUrl ?? (candidate.source.startsWith("spotify") ? candidate.url : null),
    spotifyId: candidate.spotifyId ?? null,
    instagramUrl: candidate.instagramUrl ?? null,
    instagramHandle: candidate.instagramHandle ?? null,
    youtubeUrl: candidate.youtubeUrl ?? null,
    youtubeChannelId: candidate.youtubeChannelId ?? null,
    youtubeSubscribers: candidate.youtubeSubscribers ?? null,
    youtubeTotalViews: candidate.youtubeTotalViews ?? null,
    youtubeVideoCount: candidate.youtubeVideoCount ?? null,
    genres: candidateGenres,
    city: normalizeCandidateCity(candidate.city),
    country: candidate.country,
    source: candidate.source,
    sources,
    reason: buildCandidateReason(candidate, artistTier, bookingCategory, possibleUse, totalRelevance),
    confidence: calculateConfidence(genreRelevance, hasMetrics(candidate), candidate.source),
    sourceConfidence: candidate.sourceConfidence ?? defaultSourceConfidence(candidate.source),
    artistTier,
    bookingCategory,
    estimatedFollowers: candidate.followersCount ?? null,
    estimatedPopularity: candidate.popularity ?? null,
    topTrackPopularityMax: candidate.topTrackPopularityMax ?? null,
    topTrackPopularityAvg: candidate.topTrackPopularityAvg ?? null,
    topTrackCount: candidate.topTrackCount ?? null,
    sizeSignalSource,
    genreRelevance,
    localRelevance: sceneRelevance,
    sizeRelevance: sizeScore,
    sceneRelevance,
    totalRelevance,
    relevanceToUserArtist: totalRelevance,
    possibleUse,
    estimatedLevel: artistTierToEstimatedLevel(artistTier),
    evidenceNotes,
    sourceUrls: uniqueStrings(candidate.sourceUrls ?? []),
    genreEvidence: candidate.genreEvidence ?? [],
    locationEvidence: candidate.locationEvidence ?? [],
    sizeEvidence: candidate.sizeEvidence ?? [],
    verificationStatus,
    popularity: buildPopularitySummary(candidate, artistTier),
    discardedTags,
    matchedQuery: candidate.matchedQuery ?? null,
    searchRelevanceBoost: candidate.source === "spotify_search" && candidate.matchedQuery ? 20 : 0
  });

  const rejectionReason = determineDiscoveryRejectionReason(
    { ...candidate, genres: genreGateGenres },
    userGenres,
    genreRelevance,
    sizeScore,
    sceneRelevance
  );
  const shouldKeep = rejectionReason === null;

  return {
    artist,
    shouldKeep,
    matchedQuery: candidate.matchedQuery ?? null,
    sourceConfidence: candidate.sourceConfidence ?? defaultSourceConfidence(candidate.source),
    rejectionReason
  };
}

function scoreDiscoverySizeRelevance(
  userMetrics: ArtistMetrics,
  candidate: SimilarArtistDiscoveryCandidate
): SizeRelevanceResult {
  void userMetrics;
  const sizeSignal = estimateArtistSize({
    spotifyFollowers: candidate.followersCount ?? null,
    spotifyArtistPopularity: candidate.popularity ?? null,
    spotifyTopTrackPopularityMax: candidate.topTrackPopularityMax ?? null,
    spotifyTopTrackPopularityAvg: candidate.topTrackPopularityAvg ?? null,
    youtubeSubscribers: candidate.youtubeSubscribers ?? null,
    youtubeTotalViews: candidate.youtubeTotalViews ?? null,
    youtubeVideoCount: candidate.youtubeVideoCount ?? null,
    manualEstimatedTier: candidate.manualEstimatedTier ?? candidate.estimatedTier ?? null
  });
  if (sizeSignal.sizeTier === "unknown") {
    return {
      artistTier: "unknown",
      score: 35,
      sizeSignalSource: "unknown"
    };
  }

  return {
    artistTier: sizeSignal.sizeTier,
    score: scoreForTier(sizeSignal.sizeTier),
    sizeSignalSource: sizeSignal.sizeSignalSource
  };
}

function determineBookingCategory(
  candidate: SimilarArtistDiscoveryCandidate,
  artistTier: ArtistTier,
  genreRelevance: number,
  localRelevance: number,
  input: SimilarArtistsFinderInput
): BookingCategory {
  const country = normalizeText(candidate.country ?? "");
  const city = normalizeText(candidate.city ?? "");
  const target = normalizeText(input.target ?? "");
  const targetCountry = input.profile.country ? normalizeText(input.profile.country) : "";
  const frenchTarget = isFrenchTarget(input.target);
  const isFrance = country === "france" || targetCountry === "france" || (frenchTarget && country === "france");
  const sameCity = input.city ? city === normalizeText(input.city) : false;
  const sameCountry = Boolean(country && targetCountry && country === targetCountry);
  const strongGenre = genreRelevance >= 60;
  const accessibleSize = artistTier === "small" || artistTier === "unknown" || artistTier === "medium";

  if (sameCity && strongGenre && accessibleSize) {
    return "local_peer";
  }

  if ((sameCountry || isFrance) && strongGenre && localRelevance >= 60 && accessibleSize) {
    return "regional_peer";
  }

  if (strongGenre && localRelevance >= 50 && (artistTier === "medium" || artistTier === "small")) {
    return "support_target";
  }

  if (artistTier === "large" || localRelevance < 40 || (candidate.source === "spotify_search" && localRelevance <= 45)) {
    return "reference";
  }

  return "unknown";
}

function applyVerificationBookingCategory(
  bookingCategory: BookingCategory,
  verificationStatus: ArtistVerificationStatus,
  genreRelevance: number,
  sceneRelevance: number
): BookingCategory {
  if (verificationStatus === "verified") {
    if (bookingCategory === "unknown" && genreRelevance >= 60) {
      return "to_verify";
    }
    return bookingCategory;
  }

  if (verificationStatus === "needs_verification") {
    return bookingCategory === "reference" ? "reference" : "to_verify";
  }

  if ((bookingCategory === "local_peer" || bookingCategory === "regional_peer") && genreRelevance >= 85 && sceneRelevance >= 85) {
    return bookingCategory;
  }

  return "unknown";
}

async function consolidateSimilarArtistCandidates(
  candidates: SimilarArtistDiscoveryCandidate[],
  input: SimilarArtistsFinderInput,
  env: SimilarArtistsFinderInput["env"]
): Promise<SimilarArtistDiscoveryCandidate[]> {
  if (env?.CONSOLIDATE_SIMILAR_ARTISTS !== "true") {
    debugLog("artist-consolidation", "similar artist consolidation skipped", {
      reason: "CONSOLIDATE_SIMILAR_ARTISTS is not true"
    });
    return candidates;
  }

  const limit = parseConsolidationLimit(env.CONSOLIDATE_SIMILAR_ARTISTS_LIMIT);
  const selected = new Set(selectCandidatesForConsolidation(candidates, limit));
  const selectedNames = candidates.filter((candidate) => selected.has(candidate)).map((candidate) => candidate.name);
  const notSelectedNames = candidates.filter((candidate) => !selected.has(candidate)).map((candidate) => candidate.name);
  const consolidated: SimilarArtistDiscoveryCandidate[] = [];
  let attempted = 0;

  debugLog("artist-consolidation", "consolidation candidate selection", {
    totalCandidatesBeforeConsolidation: candidates.length,
    limit,
    selectedForConsolidation: selectedNames,
    notSelectedForConsolidation: notSelectedNames
  });

  for (const candidate of candidates) {
    if (!selected.has(candidate)) {
      const skippedReason = "Not consolidated because it was outside consolidation limit.";
      const skipped = shouldRetainUnconsolidatedCandidate(candidate)
        ? {
            ...candidate,
            verificationStatus: candidate.verificationStatus ?? "needs_verification",
            consolidationSkippedReason: skippedReason,
            reason: appendSentence(candidate.reason, skippedReason),
            notes: appendSentence(candidate.notes ?? "", skippedReason)
          }
        : {
            ...candidate,
            consolidationSkippedReason: skippedReason
          };
      if (isBadFrequenciesCandidate(candidate.name)) {
        debugLog("artist-consolidation", "Bad Frequencies consolidation trace", {
          initialIndex: candidate.discoveryIndex,
          selectedForConsolidation: false,
          consolidationResult: "skipped",
          reason: skippedReason
        });
      }
      consolidated.push(skipped);
      continue;
    }

    attempted += 1;
    const sources = uniqueStrings([candidate.source, ...(candidate.notes ? ["musicbrainz"] : [])]);
    if (isBroadPeakCandidate(candidate.name)) {
      debugLog("artist-consolidation", "Broad Peak consolidation trace", {
        attempted: true,
        sources,
        genres: candidate.genres,
        country: candidate.country
      });
    }
    if (isBadFrequenciesCandidate(candidate.name)) {
      debugLog("artist-consolidation", "Bad Frequencies consolidation trace", {
        initialIndex: candidate.discoveryIndex,
        selectedForConsolidation: true,
        sources,
        genres: candidate.genres,
        country: candidate.country
      });
    }
    const result = await consolidateArtistCandidate(
      {
        name: candidate.name,
        spotifyUrl: candidate.spotifyUrl ?? (candidate.source.startsWith("spotify") ? candidate.url : null),
        spotifyId: candidate.spotifyId ?? null,
        instagramUrl: candidate.instagramUrl ?? null,
        instagramHandle: candidate.instagramHandle ?? null,
        youtubeUrl: candidate.youtubeUrl ?? null,
        youtubeChannelId: candidate.youtubeChannelId ?? null,
        youtubeSubscribers: candidate.youtubeSubscribers ?? null,
        youtubeTotalViews: candidate.youtubeTotalViews ?? null,
        youtubeVideoCount: candidate.youtubeVideoCount ?? null,
        genres: candidate.genres,
        city: candidate.city,
        country: candidate.country,
        sources,
        sourceUrls: candidate.sourceUrls ?? compactStrings([candidate.url]),
        evidenceNotes: compactStrings([candidate.reason, candidate.notes]),
        genreEvidence: candidate.genreEvidence ?? [],
        locationEvidence: candidate.locationEvidence ?? [],
        sizeEvidence: candidate.sizeEvidence ?? [],
        followersCount: candidate.followersCount ?? null,
        popularity: candidate.popularity ?? null,
        musicBrainzId: candidate.musicBrainzId ?? null
      },
      {
        profile: input.profile,
        userGenres: collectUserGenres(input),
        city: input.city,
        target: input.target,
        spotifySearch: input.spotifySearch,
        lastfmArtistInfo: input.lastfmArtistInfo,
        musicBrainzSearch: input.musicBrainzSearch,
        webSearchProvider: input.webSearchProvider,
        youtubeChannelStats: input.youtubeChannelStats,
        env
      }
    );

    if (isBadFrequenciesCandidate(candidate.name)) {
      debugLog("artist-consolidation", "Bad Frequencies consolidation result", {
        verificationStatus: result.verificationStatus,
        genres: result.genres,
        country: result.country,
        city: result.city,
        sourceUrls: result.sourceUrls,
        evidenceNotes: result.evidenceNotes
      });
    }

    consolidated.push(mergeConsolidation(candidate, result));
  }

  debugLog("artist-consolidation", "consolidation summary", {
    candidates: candidates.length,
    candidatesAfterConsolidation: consolidated.length,
    candidatesAfterConsolidationNames: consolidated.map((candidate) => candidate.name),
    attempted,
    limit
  });

  return consolidated;
}

function parseConsolidationLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "20", 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 100)) : 20;
}

function shouldRetainUnconsolidatedCandidate(candidate: SimilarArtistDiscoveryCandidate): boolean {
  return candidate.source === "lastfm_similar";
}

function selectCandidatesForConsolidation(
  candidates: SimilarArtistDiscoveryCandidate[],
  limit: number
): SimilarArtistDiscoveryCandidate[] {
  if (limit <= 0) {
    return [];
  }

  return [...candidates]
    .sort((left, right) => consolidationPriority(left) - consolidationPriority(right))
    .slice(0, limit);
}

function consolidationPriority(candidate: SimilarArtistDiscoveryCandidate): number {
  if (candidate.source === "lastfm_similar") {
    return 1;
  }
  if (candidate.musicBrainzId || candidate.notes?.toLowerCase().includes("musicbrainz")) {
    return 2;
  }
  if (candidate.source === "seed" && candidate.verificationStatus !== "verified") {
    return 3;
  }
  if (candidate.source === "spotify_search" || candidate.source === "spotify_related") {
    return 5;
  }
  return 4;
}

function mergeConsolidation(
  candidate: SimilarArtistDiscoveryCandidate,
  consolidation: ArtistConsolidationResult
): SimilarArtistDiscoveryCandidate {
  return {
    ...candidate,
    spotifyUrl: consolidation.spotifyUrl ?? candidate.spotifyUrl ?? null,
    spotifyId: consolidation.spotifyId ?? candidate.spotifyId ?? null,
    instagramUrl: consolidation.instagramUrl ?? candidate.instagramUrl ?? null,
    instagramHandle: consolidation.instagramHandle ?? candidate.instagramHandle ?? null,
    youtubeUrl: consolidation.youtubeUrl ?? candidate.youtubeUrl ?? null,
    youtubeChannelId: consolidation.youtubeChannelId ?? candidate.youtubeChannelId ?? null,
    youtubeSubscribers: consolidation.youtubeSubscribers ?? candidate.youtubeSubscribers ?? null,
    youtubeTotalViews: consolidation.youtubeTotalViews ?? candidate.youtubeTotalViews ?? null,
    youtubeVideoCount: consolidation.youtubeVideoCount ?? candidate.youtubeVideoCount ?? null,
    genres: uniqueStrings([...candidate.genres, ...consolidation.genres]),
    city: consolidation.city ?? candidate.city,
    country: consolidation.country ?? candidate.country,
    verificationStatus: consolidation.verificationStatus,
    sourceUrls: uniqueStrings([...(candidate.sourceUrls ?? []), ...consolidation.sourceUrls]),
    genreEvidence: [...(candidate.genreEvidence ?? []), ...consolidation.genreEvidence],
    locationEvidence: [...(candidate.locationEvidence ?? []), ...consolidation.locationEvidence],
    sizeEvidence: [...(candidate.sizeEvidence ?? []), ...consolidation.sizeEvidence],
    followersCount: candidate.followersCount ?? firstSizeEvidenceNumber(consolidation.sizeEvidence, "followers"),
    popularity: candidate.popularity ?? firstSizeEvidenceNumber(consolidation.sizeEvidence, "popularity"),
    consolidation,
    verification: {
      spotifyUrl: consolidation.spotifyUrl,
      spotifyId: consolidation.spotifyId,
      instagramUrl: consolidation.instagramUrl,
      instagramHandle: consolidation.instagramHandle,
      youtubeUrl: consolidation.youtubeUrl,
      country: consolidation.country,
      city: consolidation.city,
      genres: consolidation.genres,
      verificationStatus: consolidation.verificationStatus,
      evidenceNotes: consolidation.evidenceNotes,
      sourceUrls: consolidation.sourceUrls
    }
  };
}

function firstSizeEvidenceNumber(evidence: SizeEvidence[], field: "followers" | "popularity"): number | null {
  for (const entry of evidence) {
    const value = entry[field];
    if (typeof value === "number") {
      return value;
    }
  }
  return null;
}

async function verifySimilarArtistCandidates(
  candidates: SimilarArtistDiscoveryCandidate[],
  input: SimilarArtistsFinderInput,
  env: SimilarArtistsFinderInput["env"]
): Promise<SimilarArtistDiscoveryCandidate[]> {
  if (env?.VERIFY_SIMILAR_ARTISTS !== "true") {
    debugLog("artist-verification", "similar artist verification skipped", {
      reason: "VERIFY_SIMILAR_ARTISTS is not true"
    });
    return candidates;
  }

  const limit = parseVerificationLimit(env.VERIFY_SIMILAR_ARTISTS_LIMIT);
  const spotifySearchProvider =
    input.spotifySearch ?? ((query: string, searchLimit: number) => searchSpotifyArtists(query, searchLimit, env));
  const enriched: SimilarArtistDiscoveryCandidate[] = [];
  let attempted = 0;

  for (const candidate of candidates) {
    if (!shouldVerifyCandidate(candidate) || attempted >= limit) {
      enriched.push(candidate);
      continue;
    }

    attempted += 1;
    const sources = uniqueStrings([candidate.source, ...(candidate.notes ? ["musicbrainz"] : [])]);
    const verification = await verifyAndEnrichArtistCandidate(
      {
        name: candidate.name,
        genres: candidate.genres,
        sources,
        spotifyId: candidate.spotifyId ?? null,
        spotifyUrl: candidate.spotifyUrl ?? (candidate.source.startsWith("spotify") ? candidate.url : null),
        instagramUrl: candidate.instagramUrl ?? null,
        instagramHandle: candidate.instagramHandle ?? null,
        youtubeUrl: candidate.youtubeUrl ?? null,
        country: candidate.country,
        city: candidate.city,
        musicBrainzId: candidate.musicBrainzId ?? null,
        sourceUrls: candidate.sourceUrls ?? compactStrings([candidate.url])
      },
      {
        profile: input.profile,
        target: input.target,
        city: input.city,
        genre: input.genre,
        spotifySearch: spotifySearchProvider,
        webSearchProvider: input.webSearchProvider,
        env
      }
    );

    enriched.push(mergeVerification(candidate, verification));
  }

  debugLog("artist-verification", "verification summary", {
    candidates: candidates.length,
    attempted,
    limit
  });

  return enriched;
}

function shouldVerifyCandidate(candidate: SimilarArtistDiscoveryCandidate): boolean {
  return candidate.source !== "spotify_search" && candidate.source !== "spotify_related";
}

function parseVerificationLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "10", 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 25)) : 10;
}

function mergeVerification(
  candidate: SimilarArtistDiscoveryCandidate,
  verification: ArtistVerificationResult
): SimilarArtistDiscoveryCandidate {
  const sourceConfidenceBoost =
    verification.verificationStatus === "verified"
      ? 0.12
      : verification.verificationStatus === "needs_verification"
        ? 0.02
        : -0.08;
  const baseSourceConfidence = candidate.sourceConfidence ?? defaultSourceConfidence(candidate.source);

  return {
    ...candidate,
    spotifyId: verification.spotifyId ?? candidate.spotifyId ?? null,
    spotifyUrl: verification.spotifyUrl ?? candidate.spotifyUrl ?? null,
    instagramUrl: verification.instagramUrl ?? candidate.instagramUrl ?? null,
    instagramHandle: verification.instagramHandle ?? candidate.instagramHandle ?? null,
    youtubeUrl: verification.youtubeUrl ?? candidate.youtubeUrl ?? null,
    country: verification.country ?? candidate.country,
    city: verification.city ?? candidate.city,
    genres: uniqueStrings([...candidate.genres, ...verification.genres]),
    sourceConfidence: clampScore(Math.round(Math.min(1, Math.max(0, baseSourceConfidence + sourceConfidenceBoost)) * 100)) / 100,
    sourceUrls: uniqueStrings([...(candidate.sourceUrls ?? []), ...verification.sourceUrls]),
    verificationStatus: verification.verificationStatus,
    verification
  };
}

function inferVerificationStatus(candidate: SimilarArtistDiscoveryCandidate): ArtistVerificationStatus {
  if (candidate.spotifyId || candidate.spotifyUrl || candidate.instagramUrl || candidate.youtubeUrl || candidate.musicBrainzId) {
    return "verified";
  }
  if (candidate.source === "lastfm_similar" || candidate.source === "seed") {
    return "needs_verification";
  }
  return "unverified";
}

function buildPopularitySummary(candidate: SimilarArtistDiscoveryCandidate, artistTier: ArtistTier): SimilarArtist["popularity"] {
  const instagramEvidence = candidate.sizeEvidence?.find((entry) => entry.source === "firecrawl" && typeof entry.followers === "number");
  const youtubeEvidence = candidate.sizeEvidence?.find((entry) => entry.source === "youtube" || typeof entry.subscribers === "number" || typeof entry.views === "number");
  const lastfmEvidence = candidate.sizeEvidence?.find((entry) => entry.source === "lastfm");
  const spotifyFollowers = candidate.followersCount ?? null;
  const spotifyPopularity = candidate.popularity ?? null;
  const platforms: SimilarArtist["popularity"]["platforms"] = {};

  if (instagramEvidence) {
    platforms.instagram = {
      followers: instagramEvidence.followers ?? null,
      sourceUrl: instagramEvidence.sourceUrl ?? null
    };
  }

  if (youtubeEvidence || candidate.youtubeSubscribers || candidate.youtubeTotalViews || candidate.youtubeVideoCount) {
    platforms.youtube = {
      subscribers: candidate.youtubeSubscribers ?? youtubeEvidence?.subscribers ?? null,
      views: candidate.youtubeTotalViews ?? youtubeEvidence?.views ?? null,
      videos: candidate.youtubeVideoCount ?? null,
      sourceUrl: youtubeEvidence?.sourceUrl ?? candidate.youtubeUrl ?? null
    };
  }

  if (spotifyFollowers !== null || spotifyPopularity !== null || candidate.spotifyUrl) {
    platforms.spotify = {
      followers: spotifyFollowers,
      popularity: spotifyPopularity,
      sourceUrl: candidate.spotifyUrl ?? null
    };
  }

  if (lastfmEvidence) {
    platforms.lastfm = {
      listeners: lastfmEvidence.followers ?? null,
      playcount: lastfmEvidence.views ?? null,
      sourceUrl: lastfmEvidence.sourceUrl ?? null
    };
  }

  const sourceCount = Object.keys(platforms).length;
  return {
    estimatedLevel: artistTier,
    confidence: sourceCount > 1 ? 0.75 : sourceCount === 1 ? 0.58 : 0.2,
    sizeSignalSource: determinePopularitySource(platforms),
    platforms
  };
}

function determinePopularitySource(platforms: SimilarArtist["popularity"]["platforms"]): SimilarArtist["popularity"]["sizeSignalSource"] {
  const sources = Object.keys(platforms);
  if (sources.length > 1) {
    return "mixed";
  }
  if (platforms.instagram) {
    return "instagram";
  }
  if (platforms.youtube) {
    return "youtube";
  }
  if (platforms.spotify) {
    return "spotify";
  }
  if (platforms.lastfm) {
    return "lastfm";
  }
  return "unknown";
}

function normalizeCandidateCity(city: string | null): string | null {
  return city && normalizeText(city) !== "france" ? city : null;
}

function shouldAttemptMusicBrainzEnrichment(candidate: SimilarArtistDiscoveryCandidate): boolean {
  if (candidate.source === "mock" || candidate.source === "user") {
    return false;
  }

  if (candidate.source === "lastfm_similar" || candidate.source === "spotify_search" || candidate.source === "spotify_related") {
    return true;
  }

  return !candidate.country || candidate.genres.length === 0;
}

function mergeMusicBrainzMetadata(
  candidate: SimilarArtistDiscoveryCandidate,
  metadata: MusicBrainzArtistMetadata,
  input: SimilarArtistsFinderInput
): SimilarArtistDiscoveryCandidate {
  const mergedGenres = uniqueStrings([
    ...candidate.genres,
    ...metadata.tags
  ]);
  const mergedCountry = candidate.country ?? metadata.country ?? null;
  const mergedCity = candidate.city ?? metadata.beginArea ?? metadata.area ?? null;
  const baseConfidence = candidate.sourceConfidence ?? defaultSourceConfidence(candidate.source);
  const countryBoost = isFrenchTarget(input.target) && isFrenchCountry(metadata.country) ? 0.12 : 0.05;
  const tagBoost = metadata.tags.length > 0 ? 0.08 : 0;
  const sourceConfidence = clampScore(Math.round(Math.min(1, baseConfidence + countryBoost + tagBoost) * 100)) / 100;

  return {
    ...candidate,
    genres: mergedGenres,
    city: mergedCity,
    country: mergedCountry,
    url: candidate.url ?? metadata.sourceUrl ?? null,
    musicBrainzId: metadata.musicBrainzId,
    sourceUrls: uniqueStrings([...(candidate.sourceUrls ?? []), ...(metadata.sourceUrl ? [metadata.sourceUrl] : [])]),
    notes: candidate.notes
      ? `${candidate.notes} MusicBrainz matched ${metadata.name}.`
      : `MusicBrainz matched ${metadata.name}. Country: ${metadata.country ?? "unknown"}. Tags: ${metadata.tags.join(", ") || "none"}.`,
    sourceConfidence,
    matchedQuery: candidate.matchedQuery ?? metadata.name
  };
}

function determineDiscoveryRejectionReason(
  candidate: SimilarArtistDiscoveryCandidate,
  userGenres: string[],
  genreRelevance: number,
  sizeRelevance: number,
  sceneRelevance: number
): string | null {
  const genreGate = evaluateGenreCompatibility(userGenres, candidate.genres);
  debugLog("similar-artists", "genre gate result", {
    name: candidate.name,
    genres: candidate.genres,
    userGenres,
    result: genreGate,
    action: genreGate.level === "explicitly_incompatible" ? "hard_reject" : candidate.source === "lastfm_similar" && ["unknown", "insufficient_evidence", "weak_broad_match"].includes(genreGate.level) ? "keep_to_verify" : "continue"
  });
  if (genreGate.level === "explicitly_incompatible") {
    debugLog("similar-artists", "hard genre gate rejection", {
      name: candidate.name,
      genres: candidate.genres,
      userGenres,
      reason: genreGate.reason
    });
    return genreGate.reason;
  }

  if (candidate.source === "lastfm_similar" && ["unknown", "insufficient_evidence", "weak_broad_match"].includes(genreGate.level)) {
    debugLog("similar-artists", "lastfm candidate kept for verification", {
      name: candidate.name,
      genres: candidate.genres,
      userGenres,
      reason: genreGate.level === "weak_broad_match" ? "weak_broad_match" : genreGate.level === "insufficient_evidence" ? "insufficient_genre_evidence" : "lastfm_candidate_kept_for_verification"
    });
  }

  if (candidate.source === "seed") {
    if (genreRelevance < 35 && sceneRelevance < 70) {
      return "low_genre_and_scene";
    }
    return null;
  }

  if (candidate.source === "lastfm_similar") {
    if (genreRelevance < 18 && sceneRelevance < 45) {
      return "low_similarity";
    }
    return null;
  }

  if (candidate.genres.length === 0) {
    return candidate.matchedQuery ? null : genreRelevance < 45 ? "empty_genres_low_confidence" : null;
  }

  if (genreRelevance < 25) {
    return "low_genre_relevance";
  }

  if (sizeRelevance < 35 && sceneRelevance < 45) {
    return "low_size_and_scene";
  }

  return null;
}

function logDiscoveryCandidate(
  entry: ScoredDiscoveryCandidate
): Record<string, unknown> {
  return {
    name: entry.artist.name,
    candidateGenres: entry.artist.genres,
    matchedQuery: entry.matchedQuery,
    genreRelevance: entry.artist.genreRelevance,
    localRelevance: entry.artist.localRelevance,
    estimatedPopularity: entry.artist.estimatedPopularity,
    estimatedFollowers: entry.artist.estimatedFollowers,
    topTrackPopularityMax: entry.artist.topTrackPopularityMax,
    topTrackPopularityAvg: entry.artist.topTrackPopularityAvg,
    topTrackCount: entry.artist.topTrackCount,
    sizeSignalSource: entry.artist.sizeSignalSource,
    artistTier: entry.artist.artistTier,
    bookingCategory: entry.artist.bookingCategory,
    totalRelevance: entry.artist.totalRelevance,
    sources: entry.artist.sources,
    source: entry.artist.source,
    rejectionReason: entry.rejectionReason
  };
}

function buildCandidateReason(
  candidate: SimilarArtistDiscoveryCandidate,
  artistTier: ArtistTier,
  bookingCategory: BookingCategory,
  possibleUse: SimilarArtistPossibleUse,
  totalRelevance: number
): string {
  const sourceText =
    candidate.source === "seed"
      ? "Manual seed"
      : candidate.source === "lastfm_similar"
        ? "Last.fm similar artists"
      : candidate.source === "spotify_search"
        ? "Spotify search"
        : candidate.source === "spotify_related"
          ? "Spotify Related Artists"
          : candidate.source === "web_local_scene"
            ? "Web local scene"
            : candidate.source === "mock"
              ? "Mock"
              : candidate.source;
  const genrePart = candidate.genres.length > 0 ? `Genres: ${candidate.genres.join(", ")}.` : "Genres are sparse.";
  const notePart = candidate.notes ? ` ${candidate.notes}` : "";
  return `${sourceText} candidate ranked as ${artistTier} and categorized as ${bookingCategory}. ${genrePart}${notePart} Total relevance: ${totalRelevance}. Possible use: ${possibleUse}.`;
}

function possibleUseForBookingCategory(
  bookingCategory: BookingCategory,
  artistTier: ArtistTier,
  localRelevance: number
): SimilarArtistPossibleUse {
  if (bookingCategory === "local_peer") {
    return localRelevance >= 85 ? "local_networking" : "co_bill";
  }

  if (bookingCategory === "regional_peer") {
    return localRelevance >= 80 ? "scene_mapping" : "booking_research";
  }

  if (bookingCategory === "support_target") {
    return "support_target";
  }

  if (bookingCategory === "reference") {
    return artistTier === "large" ? "long_term_reference" : "reference";
  }

  return "unknown";
}

function determineBookingCategoryFromSignals(input: {
  artistTier: ArtistTier;
  genreRelevance: number;
  localRelevance: number;
  hasSizeSignals: boolean;
  source: SimilarArtistSource;
  city: string | null;
  country: string | null;
  target: string | null | undefined;
  inputCity: string | null | undefined;
}): BookingCategory {
  const sameCity = Boolean(input.city && input.inputCity && normalizeText(input.city) === normalizeText(input.inputCity));
  const country = normalizeText(input.country ?? "");
  const target = normalizeText(input.target ?? "");
  const franceTarget = isFrenchTarget(input.target);
  const frenchCountry = isFrenchCountry(country);
  const strongGenre = input.genreRelevance >= 60;
  const localish = input.localRelevance >= 70;
  const regionalish = input.localRelevance >= 55 || (target.includes(country) && country.length > 0);

  if (sameCity && strongGenre && input.artistTier !== "large") {
    return "local_peer";
  }

  if ((regionalish || (franceTarget && frenchCountry)) && strongGenre && input.artistTier !== "large") {
    return "regional_peer";
  }

  if (strongGenre && input.artistTier === "medium" && localish) {
    return "support_target";
  }

  if (input.artistTier === "large" || input.localRelevance < 40 || (input.source === "spotify_search" && input.hasSizeSignals)) {
    return "reference";
  }

  return "unknown";
}

function defaultSourceConfidence(source: SimilarArtistSource): number {
  if (source === "seed") {
    return 0.82;
  }
  if (source === "lastfm_similar") {
    return 0.9;
  }
  if (source === "spotify_search") {
    return 0.68;
  }
  if (source === "spotify_related") {
    return 0.72;
  }
  if (source === "mock") {
    return 0.9;
  }
  return 0.5;
}

function hasMetrics(candidate: SimilarArtistDiscoveryCandidate): boolean {
  return (
    typeof candidate.followersCount === "number" ||
    typeof candidate.popularity === "number" ||
    typeof candidate.topTrackPopularityMax === "number" ||
    typeof candidate.topTrackPopularityAvg === "number"
  );
}

function isUserArtistDiscoveryCandidate(artist: SimilarArtistDiscoveryCandidate, profile: ArtistProfile): boolean {
  const candidateName = normalizeComparableName(artist.name);
  const profileNames = [profile.artistName, profile.spotifyArtistName]
    .filter((name): name is string => Boolean(name))
    .map(normalizeComparableName);
  return profileNames.includes(candidateName) || Boolean(profile.socialLinks.spotifyUrl && artist.spotifyId && artist.spotifyId === extractSpotifyArtistId(profile.socialLinks.spotifyUrl));
}

function buildManualSeedProvider(): SimilarArtistProvider {
  return {
    name: "manual_seed",
    async discover(input) {
      const seedCandidates = await findSeedCandidatesByGenreAndTarget(
        collectUserGenres(input),
        input.target,
        input.city,
        input.seedCandidates ? Promise.resolve(input.seedCandidates) : undefined,
        { mode: isMockMode(input.env?.MOCK_AI) ? "mock" : "real" }
      );
      return seedCandidates.map(toDiscoveryCandidateFromSeed);
    }
  };
}

function buildWebLocalSceneProvider(): SimilarArtistProvider {
  return {
    name: "web_local_scene",
    async discover() {
      return [];
    }
  };
}

function buildSpotifyLightweightReason(input: {
  deepEnrichmentEnabled: boolean;
  relatedArtistsEnabled: boolean;
  topTracksEnabled: boolean;
  capabilities: SpotifyCapabilities;
}): string {
  const reasons: string[] = [];
  if (!input.deepEnrichmentEnabled) {
    reasons.push("deep enrichment disabled");
  }
  if (!input.relatedArtistsEnabled || input.capabilities.relatedArtistsAvailable === false) {
    reasons.push("related artists unavailable or disabled");
  }
  if (!input.topTracksEnabled || input.capabilities.topTracksAvailable === false) {
    reasons.push("top tracks unavailable or disabled");
  }
  if (input.capabilities.artistFollowersAvailable === false) {
    reasons.push("artist followers missing");
  }
  if (input.capabilities.artistPopularityAvailable === false) {
    reasons.push("artist popularity missing");
  }
  if (input.capabilities.artistGenresAvailable === false) {
    reasons.push("artist genres missing");
  }

  return reasons.length > 0
    ? `Spotify is treated as a lightweight ID/search provider because ${reasons.join(", ")}.`
    : "Spotify is treated as a lightweight ID/search provider while relying on better size signals from other providers.";
}

function buildSpotifySimilarArtistProvider(env: SimilarArtistsFinderInput["env"]): SimilarArtistProvider {
  const enrichmentCache = new Map<string, Promise<SpotifyArtistProfile | null>>();
  const spotifyCapabilities: SpotifyCapabilities = createSpotifyCapabilities(env);
  const deepEnrichmentEnabled = env?.ENABLE_SPOTIFY_DEEP_ENRICHMENT === "true";
  const relatedArtistsEnabled = env?.ENABLE_SPOTIFY_RELATED_ARTISTS === "true";
  const topTracksEnabled = env?.ENABLE_SPOTIFY_TOP_TRACKS === "true";
  return {
    name: "spotify_search",
    async discover(input) {
      const candidates: SimilarArtistDiscoveryCandidate[] = [];
      const relatedProvider =
        input.spotifyRelatedArtists ?? ((spotifyArtistId: string) => getSpotifyRelatedArtists(spotifyArtistId, env, fetch, spotifyCapabilities));
      const searchProvider =
        input.spotifySearch ?? ((query: string, limit: number) => searchSpotifyArtists(query, limit, env, fetch, spotifyCapabilities));
      const artistByIdProvider =
        input.spotifyArtistById ??
        ((spotifyArtistId: string) => getSpotifyArtistById(spotifyArtistId, env, fetch, undefined, spotifyCapabilities));
      const spotifyArtistId = input.profile.socialLinks.spotifyUrl
        ? extractSpotifyArtistId(input.profile.socialLinks.spotifyUrl)
        : null;

      debugLog("spotify", "Spotify capabilities inferred", {
        artistFollowersAvailable: spotifyCapabilities.artistFollowersAvailable,
        artistPopularityAvailable: spotifyCapabilities.artistPopularityAvailable,
        artistGenresAvailable: spotifyCapabilities.artistGenresAvailable,
        relatedArtistsAvailable: spotifyCapabilities.relatedArtistsAvailable,
        topTracksAvailable: spotifyCapabilities.topTracksAvailable,
        deepEnrichmentEnabled,
        relatedArtistsEnabled,
        topTracksEnabled,
        lightweightProviderReason: buildSpotifyLightweightReason({
          deepEnrichmentEnabled,
          relatedArtistsEnabled,
          topTracksEnabled,
          capabilities: spotifyCapabilities
        })
      });

      const canAttemptDeepEnrichment =
        deepEnrichmentEnabled &&
        spotifyCapabilities.artistFollowersAvailable !== false &&
        spotifyCapabilities.artistPopularityAvailable !== false &&
        spotifyCapabilities.artistGenresAvailable !== false;
      const canAttemptRelatedArtists = relatedArtistsEnabled && spotifyCapabilities.relatedArtistsAvailable !== false;

      if (spotifyArtistId && canAttemptRelatedArtists) {
        const relatedArtists = await relatedProvider(spotifyArtistId);
        if (relatedArtists.length > 0) {
          for (const artist of relatedArtists) {
            const enriched = await enrichSpotifyArtistCandidate(
              artist,
              artistByIdProvider,
              enrichmentCache,
              spotifyCapabilities,
              canAttemptDeepEnrichment
            );
            candidates.push({
              name: enriched.name,
              genres: enriched.genres,
              city: null,
              country: null,
              url: enriched.spotifyUrl,
              source: "spotify_related",
              reason: "Spotify related artists candidate.",
              spotifyId: enriched.id,
              followersCount: enriched.followers,
              popularity: enriched.popularity,
              topTrackPopularityMax: enriched.topTrackPopularityMax,
              topTrackPopularityAvg: enriched.topTrackPopularityAvg,
              topTrackCount: enriched.topTrackCount,
              images: enriched.images ?? [],
              sourceConfidence: enriched.genres.length > 0 ? 0.72 : 0.62,
              sizeSignalSource: enriched.sizeSignalSource ?? determineSpotifyArtistSizeSignalSource(enriched)
            });
          }
          return candidates;
        }
      }

      const queries = buildSpotifyCandidateQueries(input);
      const seenIds = new Set<string>();
      const seenNames = new Set<string>();
      const searchedArtists: SpotifyArtistProfile[] = [];
      let enrichedCandidateCount = 0;
      let candidateMetricCount = 0;

      for (const query of queries) {
        const results = await searchProvider(query, 10);
        searchedArtists.push(...results);
        for (const result of results) {
          const enriched = await enrichSpotifyArtistCandidate(
            result,
            artistByIdProvider,
            enrichmentCache,
            spotifyCapabilities,
            canAttemptDeepEnrichment
          );
          enrichedCandidateCount += 1;
          if (
            typeof enriched.followers === "number" ||
            typeof enriched.popularity === "number" ||
            typeof enriched.topTrackPopularityMax === "number" ||
            typeof enriched.topTrackPopularityAvg === "number"
          ) {
            candidateMetricCount += 1;
          }
          const normalizedName = normalizeComparableName(enriched.name);
          if (enriched.id && seenIds.has(enriched.id)) {
            continue;
          }
          if (seenNames.has(normalizedName)) {
            continue;
          }
          if (enriched.id) {
            seenIds.add(enriched.id);
          }
          seenNames.add(normalizedName);
          candidates.push({
            name: enriched.name,
            genres: enriched.genres,
            city: null,
            country: null,
            url: enriched.spotifyUrl,
            source: "spotify_search",
            reason: `Spotify search result for query "${query}".`,
            spotifyId: enriched.id,
            followersCount: enriched.followers,
            popularity: enriched.popularity,
            topTrackPopularityMax: enriched.topTrackPopularityMax,
            topTrackPopularityAvg: enriched.topTrackPopularityAvg,
            topTrackCount: enriched.topTrackCount,
            images: enriched.images ?? [],
            matchedQuery: query,
            sourceConfidence: enriched.genres.length > 0 ? 0.7 : 0.55,
            sizeSignalSource: enriched.sizeSignalSource ?? determineSpotifyArtistSizeSignalSource(enriched)
          });
        }
      }

      debugLog("similar-artists", "spotify search candidate counts", {
        searchCandidatesCount: searchedArtists.length,
        enrichedCandidatesCount: enrichedCandidateCount,
        candidatesWithMetricsCount: candidateMetricCount
      });
      return candidates;
    }
  };
}

function toDiscoveryCandidateFromSeed(seed: SeedMatchCandidate): SimilarArtistDiscoveryCandidate {
  return {
    name: seed.name,
    genres: seed.genres,
    city: seed.city,
    country: seed.country,
    url: seed.url,
    source: "seed",
    reason: seed.notes,
    notes: seed.notes,
    estimatedTier: seed.estimatedTier,
    matchedQuery: seed.matchedQuery,
    sourceConfidence: seed.sourceConfidence,
    spotifyUrl: seed.spotifyUrl ?? null,
    instagramUrl: seed.instagramUrl ?? null,
    youtubeUrl: seed.youtubeUrl ?? null,
    sourceUrls: compactStrings([seed.sourceUrl, seed.url, seed.spotifyUrl, seed.instagramUrl, seed.youtubeUrl]),
    verificationStatus: seed.verified ? "verified" : "needs_verification"
  };
}

function buildSpotifyCandidateQueries(input: SimilarArtistsFinderInput): string[] {
  const userGenres = collectUserGenres(input);
  const baseGenres = uniqueStrings(userGenres);
  const locationParts = uniqueStrings([input.target ?? "", input.city ?? "", input.profile.country ?? ""]);
  const queries = new Set<string>();

  for (const genre of baseGenres) {
    queries.add(genre);
    for (const location of locationParts) {
      if (location) {
        queries.add(`${genre} ${location}`);
      }
    }
    for (const variant of deriveBroadGenreVariants(genre)) {
      queries.add(variant);
      for (const location of locationParts) {
        if (location) {
          queries.add(`${variant} ${location}`);
        }
      }
    }
  }

  return [...queries].slice(0, 16);
}

function deriveBroadGenreVariants(genre: string): string[] {
  const tokens = normalizeText(genre)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
  return tokens.length > 1 ? tokens : [];
}

async function enrichSpotifyArtistCandidate(
  artist: SpotifyArtistProfile,
  artistByIdProvider: (spotifyArtistId: string) => Promise<SpotifyArtistProfile | null>,
  cache: Map<string, Promise<SpotifyArtistProfile | null>>,
  capabilities: SpotifyCapabilities,
  deepEnrichmentEnabled: boolean
): Promise<SpotifyArtistProfile> {
  if (!deepEnrichmentEnabled) {
    return artist;
  }

  if (
    capabilities.artistFollowersAvailable === false ||
    capabilities.artistPopularityAvailable === false ||
    capabilities.artistGenresAvailable === false
  ) {
    return artist;
  }

  debugLog("spotify", "Spotify search candidate detail fetch", {
    candidateName: artist.name,
    spotifyId: artist.id,
    detailFetchAttempted: true
  });
  if (!cache.has(artist.id)) {
    cache.set(artist.id, artistByIdProvider(artist.id));
  }

  const refreshed = await cache.get(artist.id);
  if (!refreshed) {
    capabilities.artistFollowersAvailable = false;
    capabilities.artistPopularityAvailable = false;
    capabilities.artistGenresAvailable = false;
    debugLog("spotify", "enriched Spotify candidate", {
      candidateName: artist.name,
      spotifyId: artist.id,
      detailFetchAttempted: true,
      detailFetchSucceeded: false,
      enrichmentSucceeded: false,
      followersCount: artist.followers,
      popularity: artist.popularity,
      genresCount: artist.genres.length
    });
    return artist;
  }

  const merged: SpotifyArtistProfile = {
    id: artist.id,
    name: refreshed.name ?? artist.name,
    followers: typeof refreshed.followers === "number" ? refreshed.followers : artist.followers,
    popularity: typeof refreshed.popularity === "number" ? refreshed.popularity : artist.popularity,
    genres: refreshed.genres.length > 0 ? refreshed.genres : artist.genres,
    spotifyUrl: refreshed.spotifyUrl || artist.spotifyUrl,
    images: refreshed.images.length > 0 ? refreshed.images : (artist.images ?? []),
    topTrackPopularityMax: typeof refreshed.topTrackPopularityMax === "number" ? refreshed.topTrackPopularityMax : artist.topTrackPopularityMax ?? null,
    topTrackPopularityAvg: typeof refreshed.topTrackPopularityAvg === "number" ? refreshed.topTrackPopularityAvg : artist.topTrackPopularityAvg ?? null,
    topTrackCount: typeof refreshed.topTrackCount === "number" ? refreshed.topTrackCount : artist.topTrackCount ?? null,
    sizeSignalSource: determineSpotifyArtistSizeSignalSource({
      followers: typeof refreshed.followers === "number" ? refreshed.followers : artist.followers,
      popularity: typeof refreshed.popularity === "number" ? refreshed.popularity : artist.popularity,
      topTrackPopularityMax:
        typeof refreshed.topTrackPopularityMax === "number" ? refreshed.topTrackPopularityMax : artist.topTrackPopularityMax ?? null,
      topTrackPopularityAvg:
        typeof refreshed.topTrackPopularityAvg === "number" ? refreshed.topTrackPopularityAvg : artist.topTrackPopularityAvg ?? null
    })
  };

  if (typeof merged.followers !== "number") {
    capabilities.artistFollowersAvailable = false;
  }
  if (typeof merged.popularity !== "number") {
    capabilities.artistPopularityAvailable = false;
  }
  if (merged.genres.length === 0) {
    capabilities.artistGenresAvailable = false;
  }

  debugLog("spotify", "enriched Spotify candidate", {
    candidateName: merged.name,
    spotifyId: merged.id,
    detailFetchAttempted: true,
    detailFetchSucceeded: true,
    enrichmentSucceeded: true,
    followersCount: merged.followers,
    popularity: merged.popularity,
    genresCount: merged.genres.length
  });

  return merged;
}

export function scoreGenreRelevance(userGenres: string[], candidateGenres: string[]): number {
  return scoreGenreRelevanceWithContext(userGenres, candidateGenres);
}

export function scoreGenreRelevanceWithContext(
  userGenres: string[],
  candidateGenres: string[],
  candidateName?: string | null,
  matchedQuery?: string | null
): number {
  const user = expandGenres(userGenres);
  const candidate = expandGenres(candidateGenres);
  const normalizedCandidateName = candidateName ? normalizeText(candidateName) : null;
  const normalizedMatchedQuery = matchedQuery ? normalizeText(matchedQuery) : null;

  if (user.exact.size === 0) {
    return 20;
  }

  const compatibility = evaluateGenreCompatibility(userGenres, candidateGenres);
  if (candidateGenres.length > 0 && compatibility.level === "explicitly_incompatible") {
    return 10;
  }

  if (compatibility.compatible && compatibility.confidence >= 0.9) {
    return 95;
  }

  if (compatibility.compatible) {
    return 85;
  }

  if (compatibility.level === "weak_broad_match") {
    return 55;
  }

  if (compatibility.level === "insufficient_evidence") {
    return 35;
  }

  if (candidate.exact.size > 0 && hasIntersection(user.exact, candidate.exact)) {
    return 95;
  }

  if (hasIntersection(user.expanded, candidate.expanded)) {
    return 85;
  }

  if (hasIntersection(user.tokens, candidate.tokens)) {
    return 60;
  }

  if (candidate.exact.size > 0) {
    return 20;
  }

  if (normalizedMatchedQuery && isFocusedGenreQuery(normalizedMatchedQuery, user)) {
    return 45;
  }

  if (normalizedCandidateName && hasTextOverlap(normalizedCandidateName, user)) {
    return 35;
  }

  return 15;
}

export function scoreSizeRelevance(userMetrics: ArtistMetrics, candidateMetrics: ArtistMetrics): SizeRelevanceResult {
  void userMetrics;
  const sizeSignal = estimateArtistSize({
    spotifyFollowers: candidateMetrics.followers ?? null,
    spotifyArtistPopularity: candidateMetrics.popularity ?? null,
    spotifyTopTrackPopularityMax: candidateMetrics.topTrackPopularityMax ?? null,
    spotifyTopTrackPopularityAvg: candidateMetrics.topTrackPopularityAvg ?? null,
    youtubeSubscribers: candidateMetrics.youtubeSubscribers ?? null,
    youtubeTotalViews: candidateMetrics.youtubeTotalViews ?? null,
    youtubeVideoCount: candidateMetrics.youtubeVideoCount ?? null,
    manualEstimatedTier: candidateMetrics.manualEstimatedTier ?? null
  });
  return {
    artistTier: sizeSignal.sizeTier,
    score: scoreForTier(sizeSignal.sizeTier),
    sizeSignalSource: sizeSignal.sizeSignalSource
  };
}

export function scoreSceneRelevance(
  candidate: Pick<SimilarArtist, "city" | "country">,
  target: string | null | undefined,
  city: string | null | undefined
): number {
  const normalizedCity = city ? normalizeText(city) : null;
  const normalizedTarget = target ? normalizeText(target) : null;
  const candidateCity = candidate.city ? normalizeText(candidate.city) : null;
  const candidateCountry = candidate.country ? normalizeText(candidate.country) : null;

  if (normalizedCity && candidateCity && candidateCity === normalizedCity) {
    return 90;
  }

  if (normalizedTarget && candidateCity && normalizedTarget.includes(candidateCity)) {
    return 75;
  }

  if (normalizedTarget && countryMatchesTarget(candidateCountry, normalizedTarget)) {
    return 85;
  }

  if (!candidateCity && !candidateCountry) {
    return 45;
  }

  if (candidateCountry) {
    return 55;
  }

  return 50;
}

export function determineAbsoluteArtistTier(
  estimatedFollowers: number | null,
  estimatedPopularity: number | null
): ArtistTier {
  if (estimatedFollowers === null && estimatedPopularity === null) {
    return "unknown";
  }

  const followers = estimatedFollowers ?? 0;
  const popularity = estimatedPopularity ?? 0;

  if (popularity > 45 || followers > 50000) {
    return "large";
  }

  if ((popularity >= 25 && popularity <= 45) || (followers >= 5000 && followers <= 50000)) {
    return "medium";
  }

  if (popularity < 25 || followers < 5000) {
    return "small";
  }

  return "unknown";
}

function determineCandidateSizeSignal(candidateMetrics: ArtistMetrics): {
  artistTier: ArtistTier;
  sizeSignalSource: SizeSignalSource;
} {
  if (typeof candidateMetrics.popularity === "number" || typeof candidateMetrics.followers === "number") {
    const artistTier = determineAbsoluteArtistTier(candidateMetrics.followers ?? null, candidateMetrics.popularity ?? null);
    return {
      artistTier,
      sizeSignalSource: "spotify_artist"
    };
  }

  const topTrackTier = determineTopTrackArtistTier(
    candidateMetrics.topTrackPopularityMax ?? null,
    candidateMetrics.topTrackPopularityAvg ?? null
  );
  if (topTrackTier !== "unknown") {
    return {
      artistTier: topTrackTier,
      sizeSignalSource: "spotify_tracks"
    };
  }

  return {
    artistTier: "unknown",
    sizeSignalSource: "unknown"
  };
}

function determineTopTrackArtistTier(
  topTrackPopularityMax: number | null,
  topTrackPopularityAvg: number | null
): ArtistTier {
  if (topTrackPopularityMax === null && topTrackPopularityAvg === null) {
    return "unknown";
  }

  if (
    (typeof topTrackPopularityMax === "number" && topTrackPopularityMax > 55) ||
    (typeof topTrackPopularityAvg === "number" && topTrackPopularityAvg > 45)
  ) {
    return "large";
  }

  if (
    (typeof topTrackPopularityMax === "number" && topTrackPopularityMax >= 30 && topTrackPopularityMax <= 55) ||
    (typeof topTrackPopularityAvg === "number" && topTrackPopularityAvg >= 25 && topTrackPopularityAvg <= 45)
  ) {
    return "medium";
  }

  if (
    (typeof topTrackPopularityMax === "number" && topTrackPopularityMax < 30) ||
    (typeof topTrackPopularityAvg === "number" && topTrackPopularityAvg < 25)
  ) {
    return "small";
  }

  return "unknown";
}

function determineSpotifyArtistSizeSignalSource(
  artist: Pick<SpotifyArtistProfile, "followers" | "popularity" | "topTrackPopularityMax" | "topTrackPopularityAvg">
): SizeSignalSource {
  if (typeof artist.popularity === "number") {
    return "spotify_artist";
  }

  if (typeof artist.followers === "number") {
    return "spotify_artist";
  }

  if (typeof artist.topTrackPopularityMax === "number" || typeof artist.topTrackPopularityAvg === "number") {
    return "spotify_tracks";
  }

  return "unknown";
}

export function mapSpotifyArtistToSimilarArtist(
  artist: SpotifyArtistProfile,
  input: Pick<SimilarArtistsFinderInput, "profile" | "genre" | "city" | "target">,
  source: Extract<SimilarArtistSource, "spotify_related" | "spotify_search"> = "spotify_search"
): SimilarArtist {
  const userGenres = collectUserGenres(input);
  const genreCleaningContext = buildGenreCleaningContext(input);
  const cleanedGenreResult = cleanArtistGenres(artist.genres, userGenres, genreCleaningContext);
  const cleanedGenres = cleanedGenreResult.genres;
  const genreRelevance = scoreGenreRelevanceWithContext(userGenres, cleanedGenres, artist.name, null);
  const size = scoreSizeRelevance(getUserMetrics(input.profile), {
    followers: artist.followers,
    popularity: artist.popularity,
    topTrackPopularityMax: artist.topTrackPopularityMax ?? null,
    topTrackPopularityAvg: artist.topTrackPopularityAvg ?? null
  });
  const sceneRelevance = scoreSceneRelevance({ city: null, country: null }, input.target, input.city);
  const bookingCategory = determineBookingCategoryFromSignals({
    artistTier: size.artistTier,
    genreRelevance,
    localRelevance: sceneRelevance,
    hasSizeSignals: size.artistTier !== "unknown" || size.score > 35,
    source,
    city: null,
    country: null,
    target: input.target,
    inputCity: input.city
  });
  const possibleUse = possibleUseForBookingCategory(bookingCategory, size.artistTier, sceneRelevance);
  const totalRelevance = calculateTotalRelevance(genreRelevance, size.score, sceneRelevance, source);
  const sharedGenres = findSharedGenres(userGenres, cleanedGenres);
  const genreText =
    sharedGenres.length > 0
      ? `Shared or adjacent genres: ${sharedGenres.join(", ")}.`
      : "Genre overlap is limited; retained only if overall similarity is still useful.";

  return {
    name: artist.name,
    url: artist.spotifyUrl,
    spotifyUrl: artist.spotifyUrl,
    spotifyId: artist.id,
    instagramUrl: null,
    instagramHandle: null,
    youtubeUrl: null,
    genres: cleanedGenres,
    city: null,
    country: null,
    source,
    sources: [source],
    reason: `Found through Spotify ${source === "spotify_related" ? "Related Artists" : "artist search"} and ranked by genre, size and scene relevance. ${genreText}`,
    confidence: calculateConfidence(
      genreRelevance,
      typeof artist.followers === "number" ||
        typeof artist.popularity === "number" ||
        typeof artist.topTrackPopularityMax === "number" ||
        typeof artist.topTrackPopularityAvg === "number",
      source
    ),
    artistTier: size.artistTier,
    bookingCategory,
    estimatedFollowers: artist.followers,
    estimatedPopularity: artist.popularity,
    topTrackPopularityMax: artist.topTrackPopularityMax ?? null,
    topTrackPopularityAvg: artist.topTrackPopularityAvg ?? null,
    topTrackCount: artist.topTrackCount ?? null,
    sizeSignalSource: size.sizeSignalSource,
    genreRelevance,
    localRelevance: sceneRelevance,
    sizeRelevance: size.score,
    sceneRelevance,
    totalRelevance,
    relevanceToUserArtist: totalRelevance,
    possibleUse,
    estimatedLevel: artistTierToEstimatedLevel(size.artistTier),
    evidenceNotes: [genreText, `Source: ${source}`],
    sourceUrls: compactStrings([artist.spotifyUrl]),
    genreEvidence: artist.genres.length > 0 ? [{ source: "spotify", genres: artist.genres, confidence: 0.72, sourceUrl: artist.spotifyUrl }] : [],
    locationEvidence: [],
    sizeEvidence: [],
    verificationStatus: artist.spotifyUrl || artist.id ? "verified" : "needs_verification",
    popularity: {
      estimatedLevel: size.artistTier,
      confidence: artist.followers !== null || artist.popularity !== null ? 0.58 : 0.2,
      sizeSignalSource: artist.followers !== null || artist.popularity !== null ? "spotify" : "unknown",
      platforms: artist.followers !== null || artist.popularity !== null || artist.spotifyUrl
        ? { spotify: { followers: artist.followers, popularity: artist.popularity, sourceUrl: artist.spotifyUrl } }
        : {}
    },
    discardedTags: cleanedGenreResult.discardedTags,
    matchedQuery: null,
    searchRelevanceBoost: 0,
    spotify: {
      id: artist.id,
      url: artist.spotifyUrl,
      imageUrl: artist.images[0] ?? null,
      followers: artist.followers,
      popularity: artist.popularity,
      genres: artist.genres
    }
  };
}

async function findSpotifySimilarArtists(
  input: SimilarArtistsFinderInput,
  env: SimilarArtistsFinderInput["env"]
): Promise<SimilarArtist[]> {
  const relatedProvider =
    input.spotifyRelatedArtists ?? ((spotifyArtistId: string) => getSpotifyRelatedArtists(spotifyArtistId));
  const searchProvider = input.spotifySearch ?? ((query: string, limit: number) => searchSpotifyArtists(query, limit));
  const spotifyArtistId = input.profile.socialLinks.spotifyUrl
    ? extractSpotifyArtistId(input.profile.socialLinks.spotifyUrl)
    : null;

  debugLog("similar-artists", "spotifyUrl found", { spotifyUrlPresent: Boolean(input.profile.socialLinks.spotifyUrl) });
  debugLog("similar-artists", "extracted Spotify artist ID", { spotifyArtistId: spotifyArtistId ?? null });
  debugLog("similar-artists", "Spotify credentials present", {
    spotifyClientIdPresent: Boolean(env?.SPOTIFY_CLIENT_ID),
    spotifyClientSecretPresent: Boolean(env?.SPOTIFY_CLIENT_SECRET)
  });

  let related: SpotifyArtistProfile[] = [];
  if (spotifyArtistId) {
    try {
      related = await relatedProvider(spotifyArtistId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLog("similar-artists", "Spotify related artists endpoint failed", { error: message });
      related = [];
    }
  }
  debugLog("similar-artists", "Spotify related artists returned", { count: related.length });
  if (related.length > 0) {
    const artists = rankAndFilterSpotifyArtists(related, input, "spotify_related");
    debugLog("similar-artists", "provider used", { providerUsed: "spotify_related" });
    return artists;
  }
  debugLog("similar-artists", "Spotify related artists unavailable or empty", true);

  const searchedArtists: SpotifyArtistProfile[] = [];
  const searchMatches = new Map<string, SpotifySearchMatch>();
  for (const query of buildSpotifySearchQueries(input)) {
    try {
      const results = await searchProvider(query, 10);
      debugLog("similar-artists", "Spotify search fallback results", { query, resultCount: results.length });
      searchedArtists.push(...results);
      const normalizedQuery = normalizeText(query);
      const focusedBoost = isFocusedGenreQuery(normalizedQuery, expandGenres(collectUserGenres(input)))
        ? normalizedQuery.split(" ").filter(Boolean).length > 1
          ? 25
          : 20
        : 8;
      for (const result of results) {
        const existing = searchMatches.get(result.id);
        const nextMatch: SpotifySearchMatch = {
          matchedQuery: query,
          searchRelevanceBoost: focusedBoost
        };
        if (
          !existing ||
          nextMatch.searchRelevanceBoost > existing.searchRelevanceBoost ||
          (nextMatch.searchRelevanceBoost === existing.searchRelevanceBoost &&
            query.length > (existing.matchedQuery?.length ?? 0))
        ) {
          searchMatches.set(result.id, nextMatch);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLog("similar-artists", "Spotify search fallback failed", { query, error: message });
    }
  }

  debugLog("similar-artists", "Spotify search fallback total results", { count: searchedArtists.length });
  const artists = rankAndFilterSpotifyArtists(searchedArtists, input, "spotify_search", searchMatches);
  debugLog("similar-artists", "provider used", { providerUsed: artists.length > 0 ? "spotify_search" : "none" });
  return artists;
}

function rankAndFilterSpotifyArtists(
  artists: SpotifyArtistProfile[],
  input: SimilarArtistsFinderInput,
  source: Extract<SimilarArtistSource, "spotify_related" | "spotify_search">,
  searchMatches = new Map<string, SpotifySearchMatch>()
): SimilarArtist[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const rejectionCounts = {
    user_artist: 0,
    duplicate_id: 0,
    duplicate_name: 0,
    low_genre_relevance: 0
  };
  const rejectedSamples: Array<Record<string, unknown>> = [];
  const mapped = artists
    .filter((artist) => {
      const normalizedName = normalizeComparableName(artist.name);
      if (isUserArtist(artist, input.profile)) {
        rejectionCounts.user_artist += 1;
        rejectedSamples.push(buildRejectedCandidateSample(artist, null, "user_artist"));
        return false;
      }

      if (seenIds.has(artist.id)) {
        rejectionCounts.duplicate_id += 1;
        rejectedSamples.push(buildRejectedCandidateSample(artist, null, "duplicate_id"));
        return false;
      }

      if (seenNames.has(normalizedName)) {
        rejectionCounts.duplicate_name += 1;
        rejectedSamples.push(buildRejectedCandidateSample(artist, null, "duplicate_name"));
        return false;
      }

      seenIds.add(artist.id);
      seenNames.add(normalizedName);
      return true;
    })
    .map((artist) => {
      const match = searchMatches.get(artist.id) ?? { matchedQuery: null, searchRelevanceBoost: 0 };
      const mapped = mapSpotifyArtistToSimilarArtist(artist, input, source) as SimilarArtist & {
        matchedQuery?: string | null;
        searchRelevanceBoost?: number;
      };
      mapped.matchedQuery = match.matchedQuery;
      mapped.searchRelevanceBoost = match.searchRelevanceBoost;
      mapped.genreRelevance = scoreGenreRelevanceWithContext(
        collectUserGenres(input),
        mapped.genres,
        artist.name,
        match.matchedQuery
      );
      mapped.totalRelevance = calculateTotalRelevance(
        mapped.genreRelevance,
        mapped.sizeRelevance,
        mapped.sceneRelevance,
        source,
        clampScore(Math.round(defaultSourceConfidence(source) * 100) + match.searchRelevanceBoost)
      );
      mapped.relevanceToUserArtist = mapped.totalRelevance;
      return mapped;
    });
  debugLog("similar-artists", "spotify candidate enrichment summary", {
    candidatesEnriched: mapped.filter((artist) => Boolean(artist.spotifyId)).length,
    candidatesWithMetrics: mapped.filter(
      (artist) => artist.estimatedFollowers !== null || artist.estimatedPopularity !== null
    ).length
  });
  debugLog("similar-artists", "candidates before filtering", { count: mapped.length });

  const filtered = mapped
    .filter((artist) => {
      const rawGenreEvidence = artist.genreEvidence.flatMap((entry) => entry.genres);
      const genreGateGenres = collectGenreGateGenres(rawGenreEvidence, artist.genres, buildGenreCleaningContext(input));
      const hasCandidateGenres = genreGateGenres.length > 0;
      const genreGate = evaluateGenreCompatibility(collectUserGenres(input), genreGateGenres);
      if (genreGate.level === "explicitly_incompatible") {
        rejectionCounts.low_genre_relevance += 1;
        rejectedSamples.push(buildRejectedCandidateSample(artist, artist.matchedQuery ?? null, genreGate.reason));
        debugLog("similar-artists", "hard genre gate rejection", {
          name: artist.name,
          genres: genreGateGenres,
          userGenres: collectUserGenres(input),
          reason: genreGate.reason
        });
        return false;
      }

      if (hasCandidateGenres && artist.genreRelevance < MIN_GENRE_RELEVANCE) {
        rejectionCounts.low_genre_relevance += 1;
        rejectedSamples.push(buildRejectedCandidateSample(artist, artist.matchedQuery ?? null, "low_genre_relevance"));
        return false;
      }

      if (
        !hasCandidateGenres &&
        artist.genreRelevance + (artist.searchRelevanceBoost ?? 0) < 45
      ) {
        rejectionCounts.low_genre_relevance += 1;
        rejectedSamples.push(buildRejectedCandidateSample(artist, artist.matchedQuery ?? null, "low_genre_relevance"));
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      if (left.bookingCategory !== right.bookingCategory) {
        return bookingCategoryPriority(left.bookingCategory) - bookingCategoryPriority(right.bookingCategory);
      }

      return right.totalRelevance - left.totalRelevance;
    })
    .slice(0, 15);
  debugLog("similar-artists", "candidates after filtering", { count: filtered.length });
  debugLog("similar-artists", "rejected candidates count", {
    count:
      rejectionCounts.user_artist +
      rejectionCounts.duplicate_id +
      rejectionCounts.duplicate_name +
      rejectionCounts.low_genre_relevance
  });
  debugLog("similar-artists", "top rejection reasons", getTopRejectionReasons(rejectionCounts));
  debugLog("similar-artists", "rejected candidates", rejectedSamples.slice(0, 10));
  debugLog("similar-artists", "kept candidates", filtered.slice(0, 10).map(logSimilarArtistCandidate));
  return filtered;
}

function buildSpotifySearchQueries(input: SimilarArtistsFinderInput): string[] {
  const genres = uniqueStrings(collectUserGenres(input));
  const locations = uniqueStrings([input.target ?? "", input.city ?? "", input.profile.country ?? ""]);
  const queries = new Set<string>();

  for (const genre of genres) {
    if (genre) {
      queries.add(genre);
    }
    for (const location of locations) {
      if (genre && location) {
        queries.add(`${genre} ${location}`);
      }
    }
  }

  return [...queries].slice(0, 12);
}

function buildMockSimilarArtist(artist: SimilarArtistSeed, input: SimilarArtistsFinderInput): SimilarArtist {
  const genreRelevance = scoreGenreRelevance(collectUserGenres(input), artist.genres);
  const size = scoreSizeRelevance(getUserMetrics(input.profile), {
    followers: artist.estimatedFollowers,
    popularity: artist.estimatedPopularity
  });
  const sceneRelevance = scoreSceneRelevance(artist, input.target, input.city);
  const totalRelevance = calculateTotalRelevance(genreRelevance, size.score, sceneRelevance, "mock");
  const bookingCategory = determineBookingCategoryFromSignals({
    artistTier: size.artistTier,
    genreRelevance,
    localRelevance: sceneRelevance,
    hasSizeSignals: true,
    source: "mock",
    city: artist.city ?? input.city ?? input.profile.city ?? null,
    country: artist.country,
    target: input.target,
    inputCity: input.city
  });
  const possibleUse = possibleUseForBookingCategory(bookingCategory, size.artistTier, sceneRelevance);

  return {
    name: artist.name,
    url: null,
    spotifyUrl: null,
    spotifyId: null,
    instagramUrl: null,
    instagramHandle: null,
    youtubeUrl: null,
    genres: artist.genres,
    city: artist.city ?? input.city ?? input.profile.city ?? null,
    country: artist.country,
    source: "mock",
    sources: ["mock"],
    reason: buildReason(size.artistTier, possibleUse, totalRelevance, artist.city ?? input.city ?? input.profile.city ?? null),
    confidence: calculateConfidence(genreRelevance, true, "mock"),
    artistTier: size.artistTier,
    bookingCategory,
    estimatedFollowers: artist.estimatedFollowers,
    estimatedPopularity: artist.estimatedPopularity,
    topTrackPopularityMax: null,
    topTrackPopularityAvg: null,
    topTrackCount: null,
    sizeSignalSource: "manual",
    genreRelevance,
    localRelevance: sceneRelevance,
    sizeRelevance: size.score,
    sceneRelevance,
    totalRelevance,
    relevanceToUserArtist: totalRelevance,
    possibleUse,
    estimatedLevel: artistTierToEstimatedLevel(size.artistTier),
    evidenceNotes: [artist.name, "Mock similar artist"],
    sourceUrls: [],
    genreEvidence: [{ source: "mock", genres: artist.genres, confidence: 0.9 }],
    locationEvidence: [],
    sizeEvidence: [],
    verificationStatus: "verified",
    popularity: {
      estimatedLevel: size.artistTier,
      confidence: 0.58,
      sizeSignalSource: "manual",
      platforms: {}
    },
    discardedTags: [],
    spotify: null
  };
}

function normalizeUserProvidedArtists(input: SimilarArtistsFinderInput): SimilarArtist[] {
  return (input.userProvidedSimilarArtists ?? [])
    .map((artist) => artist.trim())
    .filter(Boolean)
    .map((name) => {
      const sceneRelevance = scoreSceneRelevance(
        { city: input.city ?? input.profile.city ?? null, country: input.profile.country ?? null },
        input.target,
        input.city
      );
      const bookingCategory = determineBookingCategoryFromSignals({
        artistTier: "unknown",
        genreRelevance: 60,
        localRelevance: sceneRelevance,
        hasSizeSignals: false,
        source: "user",
        city: input.city ?? input.profile.city ?? null,
        country: input.profile.country ?? null,
        target: input.target,
        inputCity: input.city
      });
      return {
        name,
        url: null,
        spotifyUrl: null,
        spotifyId: null,
        instagramUrl: null,
        instagramHandle: null,
        youtubeUrl: null,
        genres: input.profile.genres,
        city: input.city ?? input.profile.city ?? null,
        country: input.profile.country ?? null,
        source: "user",
        sources: ["user"],
        reason: `User-provided similar artist for comparison in ${input.target ?? input.city ?? input.profile.city ?? "the requested market"}.`,
        confidence: 0.9,
        artistTier: "unknown",
        bookingCategory,
        estimatedFollowers: null,
        estimatedPopularity: null,
        topTrackPopularityMax: null,
        topTrackPopularityAvg: null,
        topTrackCount: null,
        sizeSignalSource: "unknown",
        genreRelevance: 60,
        localRelevance: sceneRelevance,
        sizeRelevance: 35,
        sceneRelevance,
        totalRelevance: 55,
        relevanceToUserArtist: 55,
        possibleUse: "unknown",
        estimatedLevel: null,
        evidenceNotes: ["User provided"],
        sourceUrls: [],
        genreEvidence: input.profile.genres.length > 0 ? [{ source: "user", genres: input.profile.genres, confidence: 0.6 }] : [],
        locationEvidence: [],
        sizeEvidence: [],
        verificationStatus: "needs_verification",
        popularity: {
          estimatedLevel: "unknown",
          confidence: 0.2,
          sizeSignalSource: "unknown",
          platforms: {}
        },
        discardedTags: [],
        spotify: null
      };
    });
}

function possibleUseForTier(artistTier: ArtistTier): SimilarArtistPossibleUse {
  if (artistTier === "small") {
    return "co_bill";
  }

  if (artistTier === "medium") {
    return "support_target";
  }

  if (artistTier === "large") {
    return "long_term_reference";
  }

  return "unknown";
}

function artistTierToEstimatedLevel(artistTier: ArtistTier): SimilarArtist["estimatedLevel"] {
  if (artistTier === "small") {
    return "emerging";
  }

  if (artistTier === "medium") {
    return "developing";
  }

  if (artistTier === "large") {
    return "established";
  }

  return null;
}

function buildReason(
  artistTier: ArtistTier,
  possibleUse: SimilarArtistPossibleUse,
  totalRelevance: number,
  city: string | null
): string {
  const tierExplanation =
    artistTier === "small"
      ? "Similar or slightly smaller; useful for co-bills, local shows and swaps."
      : artistTier === "medium"
        ? "Moderately bigger; useful for ambitious support targets and next-step venue context."
        : artistTier === "large"
          ? "Much bigger; useful as a reference and long-term target rather than an immediate co-bill."
          : "Not enough metrics to estimate size tier.";

  return `${tierExplanation} Total relevance: ${totalRelevance}. Possible use: ${possibleUse}.${city ? ` City: ${city}.` : ""}`;
}

function calculateTotalRelevance(
  genreRelevance: number,
  sizeRelevance: number,
  sceneRelevance: number,
  source: SimilarArtistSource,
  sourceConfidence = Math.round(defaultSourceConfidence(source) * 100)
): number {
  void source;
  return clampScore(
    Math.round(genreRelevance * 0.55 + sceneRelevance * 0.25 + sizeRelevance * 0.1 + sourceConfidence * 0.1)
  );
}

function calculateConfidence(
  genreRelevance: number,
  hasMetrics: boolean,
  source: SimilarArtistSource
): number {
  const providerScore =
    source === "lastfm_similar"
      ? 0.25
      : source === "seed"
        ? 0.22
        : source === "web_local_scene"
          ? 0.2
          : source === "spotify_related"
            ? 0.15
            : source === "spotify_search"
              ? 0.08
              : 0.05;
  return Math.min(1, 0.25 + genreRelevance / 250 + (hasMetrics ? 0.2 : 0) + providerScore);
}

function getUserMetrics(profile: ArtistProfile): ArtistMetrics {
  return {
    followers: maxNullable([
      profile.platformStats.spotifyFollowers,
      profile.platformStats.youtubeSubscribers,
      profile.platformStats.instagramFollowers
    ]),
    popularity: profile.platformStats.spotifyPopularity ?? null
  };
}

function getAudienceScore(followers: number | null | undefined, popularity: number | null | undefined): number | null {
  if (typeof followers === "number" && typeof popularity === "number") {
    return followers + popularity * 50;
  }

  if (typeof followers === "number") {
    return followers;
  }

  if (typeof popularity === "number") {
    return popularity * 1000;
  }

  return null;
}

function scoreForTier(artistTier: ArtistTier): number {
  if (artistTier === "small") {
    return 80;
  }
  if (artistTier === "medium") {
    return 65;
  }
  if (artistTier === "large") {
    return 35;
  }
  return 35;
}

function getTopRejectionReasons(rejectionCounts: {
  user_artist: number;
  duplicate_id: number;
  duplicate_name: number;
  low_genre_relevance: number;
}): Array<{ reason: string; count: number }> {
  return Object.entries(rejectionCounts)
    .map(([reason, count]) => ({ reason, count }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 3);
}

function debugTierCounts(artists: SimilarArtist[]): void {
  const grouped = groupSimilarArtistsByTier(artists);
  debugLog("similar-artists", "final group counts", getGroupCounts(grouped));
}

function logSimilarArtistCandidate(
  artist: SimilarArtist & { matchedQuery?: string | null; searchRelevanceBoost?: number }
): Record<string, unknown> {
  return {
    name: artist.name,
    candidateGenres: artist.genres,
    matchedQuery: artist.matchedQuery ?? null,
    genreRelevance: artist.genreRelevance,
    localRelevance: artist.localRelevance,
    estimatedPopularity: artist.estimatedPopularity,
    estimatedFollowers: artist.estimatedFollowers,
    bookingCategory: artist.bookingCategory,
    artistTier: artist.artistTier,
    totalRelevance: artist.totalRelevance,
    sources: artist.sources
  };
}

function buildRejectedCandidateSample(
  artist: SpotifyArtistProfile | (SimilarArtist & { matchedQuery?: string | null; searchRelevanceBoost?: number }),
  matchedQuery: string | null,
  rejectionReason: string
): Record<string, unknown> {
  return {
    name: artist.name,
    candidateGenres: artist.genres,
    matchedQuery,
    genreRelevance: "genreRelevance" in artist ? artist.genreRelevance : null,
    localRelevance: "localRelevance" in artist ? artist.localRelevance : null,
    bookingCategory: "bookingCategory" in artist ? artist.bookingCategory : null,
    sources: "sources" in artist ? artist.sources : [("source" in artist ? artist.source : "spotify_search")],
    rejectionReason
  };
}

function tierPriority(artistTier: ArtistTier): number {
  if (artistTier === "small") {
    return 0;
  }
  if (artistTier === "medium") {
    return 1;
  }
  if (artistTier === "large") {
    return 2;
  }
  return 3;
}

function bookingCategoryPriority(bookingCategory: BookingCategory): number {
  if (bookingCategory === "local_peer") {
    return 0;
  }
  if (bookingCategory === "regional_peer") {
    return 1;
  }
  if (bookingCategory === "support_target") {
    return 2;
  }
  if (bookingCategory === "to_verify") {
    return 3;
  }
  if (bookingCategory === "reference") {
    return 4;
  }
  return 5;
}

function compareSimilarArtistsForOutput(left: SimilarArtist, right: SimilarArtist): number {
  if (left.bookingCategory !== right.bookingCategory) {
    return bookingCategoryPriority(left.bookingCategory) - bookingCategoryPriority(right.bookingCategory);
  }

  if (left.totalRelevance !== right.totalRelevance) {
    return right.totalRelevance - left.totalRelevance;
  }

  const verificationDelta = verificationPriority(left.verificationStatus) - verificationPriority(right.verificationStatus);
  if (verificationDelta !== 0) {
    return verificationDelta;
  }

  return (right.sourceConfidence ?? 0) - (left.sourceConfidence ?? 0);
}

function verificationPriority(status: SimilarArtist["verificationStatus"]): number {
  if (status === "verified") {
    return 0;
  }
  if (status === "needs_verification") {
    return 1;
  }
  return 2;
}

function pruneSimilarArtistsForOutput(
  sortedArtists: SimilarArtist[],
  env: SimilarArtistsFinderInput["env"]
): { finalArtists: SimilarArtist[]; pruned: Array<{ artist: SimilarArtist; reason: string }> } {
  const outputLimit = parseOutputLimit(env?.SIMILAR_ARTISTS_OUTPUT_LIMIT, 80);
  const toVerifyLimit = parseOutputLimit(env?.SIMILAR_ARTISTS_TO_VERIFY_LIMIT, 40);
  const perGroupLimit = parseOutputLimit(env?.SIMILAR_ARTISTS_PER_GROUP_LIMIT, 20);
  const grouped = groupSimilarArtistsByTier(sortedArtists);
  const pruned: Array<{ artist: SimilarArtist; reason: string }> = [];
  const selectedByGroup: SimilarArtistsByTier = {
    local_peer: [],
    regional_peer: [],
    support_target: [],
    reference: [],
    to_verify: [],
    unknown: []
  };

  for (const category of ["local_peer", "regional_peer", "support_target", "reference", "unknown"] as BookingCategory[]) {
    const group = [...grouped[category]].sort(compareSimilarArtistsForOutput);
    selectedByGroup[category] = group.slice(0, perGroupLimit);
    for (const artist of group.slice(perGroupLimit)) {
      pruned.push({ artist, reason: `${category} group limit ${perGroupLimit} reached` });
    }
  }

  const toVerify = sortToVerifyForRetention(grouped.to_verify);
  selectedByGroup.to_verify = toVerify.slice(0, toVerifyLimit);
  for (const artist of toVerify.slice(toVerifyLimit)) {
    pruned.push({ artist, reason: `to_verify limit ${toVerifyLimit} reached` });
  }

  const selected = [
    ...selectedByGroup.local_peer,
    ...selectedByGroup.regional_peer,
    ...selectedByGroup.support_target,
    ...selectedByGroup.to_verify,
    ...selectedByGroup.reference,
    ...selectedByGroup.unknown
  ].sort(compareSimilarArtistsForOutput);

  const finalArtists = selected.slice(0, outputLimit);
  for (const artist of selected.slice(outputLimit)) {
    pruned.push({ artist, reason: `overall output limit ${outputLimit} reached` });
  }

  return { finalArtists, pruned };
}

function sortToVerifyForRetention(artists: SimilarArtist[]): SimilarArtist[] {
  const promisingLastFm = artists
    .filter(isPromisingLastFmToVerify)
    .sort(compareSimilarArtistsForOutput);
  const otherArtists = artists
    .filter((artist) => !isPromisingLastFmToVerify(artist))
    .sort(compareSimilarArtistsForOutput);
  return [...promisingLastFm, ...otherArtists];
}

function isPromisingLastFmToVerify(artist: SimilarArtist): boolean {
  return (
    artist.bookingCategory === "to_verify" &&
    artist.sources.includes("lastfm_similar") &&
    artist.totalRelevance >= 30
  );
}

function parseOutputLimit(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 500)) : fallback;
}

function getGroupCounts(groups: SimilarArtistsByTier): Record<BookingCategory, number> {
  return {
    local_peer: groups.local_peer.length,
    regional_peer: groups.regional_peer.length,
    support_target: groups.support_target.length,
    reference: groups.reference.length,
    to_verify: groups.to_verify.length,
    unknown: groups.unknown.length
  };
}

function getGroupNames(groups: SimilarArtistsByTier): Record<BookingCategory, string[]> {
  return {
    local_peer: groups.local_peer.map((artist) => artist.name),
    regional_peer: groups.regional_peer.map((artist) => artist.name),
    support_target: groups.support_target.map((artist) => artist.name),
    reference: groups.reference.map((artist) => artist.name),
    to_verify: groups.to_verify.map((artist) => artist.name),
    unknown: groups.unknown.map((artist) => artist.name)
  };
}

function findArtistGroup(groups: SimilarArtistsByTier, artistName: string): BookingCategory | null {
  const normalizedArtistName = normalizeComparableName(artistName);
  for (const [group, artists] of Object.entries(groups) as Array<[BookingCategory, SimilarArtist[]]>) {
    if (artists.some((artist) => normalizeComparableName(artist.name) === normalizedArtistName)) {
      return group;
    }
  }
  return null;
}

function isBroadPeakCandidate(name: string): boolean {
  return normalizeComparableName(name) === "broad peak";
}

function isBadFrequenciesCandidate(name: string): boolean {
  return normalizeComparableName(name) === "bad frequencies";
}

function collectUserGenres(input: Pick<SimilarArtistsFinderInput, "profile" | "genre">): string[] {
  return uniqueStrings([input.genre ?? "", ...input.profile.genres, ...input.profile.spotifyGenres]);
}

function buildGenreCleaningContext(input: Pick<SimilarArtistsFinderInput, "profile" | "city" | "target">) {
  return {
    city: input.city,
    country: input.profile.country ?? null,
    targetCountry: input.target ?? input.profile.country ?? null,
    target: input.target ?? null
  };
}

function isFocusedGenreQuery(query: string, userGenres: ReturnType<typeof expandGenres>): boolean {
  return [...userGenres.exact].some((genre) => query.includes(genre));
}

function hasTextOverlap(candidateName: string, userGenres: ReturnType<typeof expandGenres>): boolean {
  return [...userGenres.tokens].some((token) => token.length >= 4 && candidateName.includes(token));
}

function findSharedGenres(userGenres: string[], candidateGenres: string[]): string[] {
  const user = expandGenres(userGenres);
  return candidateGenres.filter((genre) => user.expanded.has(normalizeText(genre)));
}

function countryMatchesTarget(candidateCountry: string | null, normalizedTarget: string): boolean {
  if (!candidateCountry) {
    return false;
  }

  const normalizedCountry = normalizeText(candidateCountry);
  if (!normalizedCountry) {
    return false;
  }

  if (normalizedTarget.includes(normalizedCountry)) {
    return true;
  }

  if (isFrenchCountry(normalizedCountry) && isFrenchTarget(normalizedTarget)) {
    return true;
  }

  return false;
}

function isFrenchCountry(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = normalizeText(value);
  return normalized === "france" || normalized === "fr" || normalized === "french republic";
}

function isFrenchTarget(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = normalizeText(value);
  return (
    normalized.includes("france") ||
    normalized.includes("french") ||
    normalized.includes("français") ||
    normalized.includes("francais") ||
    normalized.includes("française") ||
    normalized.includes("francaise") ||
    normalized.includes("grandes villes françaises") ||
    normalized.includes("grandes villes francaises")
  );
}

function expandGenres(genres: string[]): { exact: Set<string>; expanded: Set<string>; tokens: Set<string> } {
  const exact = new Set<string>();
  const expanded = new Set<string>();
  const tokens = new Set<string>();

  for (const genre of genres) {
    const normalized = normalizeGenre(genre);
    if (!normalized) {
      continue;
    }

    exact.add(normalized);
    expanded.add(normalized);
    for (const familyGenre of getGenreFamilyMembers(normalized)) {
      expanded.add(normalizeGenre(familyGenre));
    }
    for (const token of normalized.split(" ").filter(Boolean)) {
      tokens.add(token);
    }
  }

  return { exact, expanded, tokens };
}

function getGenreFamilyMembers(genre: string): string[] {
  const members = new Set<string>();
  for (const familyGenres of Object.values(GENRE_FAMILIES)) {
    if ((familyGenres as readonly string[]).includes(genre)) {
      for (const familyGenre of familyGenres) {
        members.add(familyGenre);
      }
    }
  }
  return [...members];
}

function hasIntersection(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

function isUserArtist(artist: SpotifyArtistProfile, profile: ArtistProfile): boolean {
  const candidateName = normalizeComparableName(artist.name);
  const profileNames = [profile.artistName, profile.spotifyArtistName]
    .filter((name): name is string => Boolean(name))
    .map(normalizeComparableName);
  const spotifyUrl = profile.socialLinks.spotifyUrl;

  return profileNames.includes(candidateName) || Boolean(spotifyUrl && artist.spotifyUrl === spotifyUrl);
}

function isMockMode(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function isTestMode(env: SimilarArtistsFinderInput["env"]): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true" || env?.MOCK_AI === "test";
}

function normalizeComparableName(name: string): string {
  return normalizeText(name);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map(normalizeText)
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value?.trim()));
}

function appendSentence(value: string, sentence: string): string {
  const trimmedValue = value.trim();
  const trimmedSentence = sentence.trim();
  if (!trimmedValue) {
    return trimmedSentence;
  }
  if (trimmedValue.includes(trimmedSentence)) {
    return trimmedValue;
  }
  return `${trimmedValue} ${trimmedSentence}`;
}

function maxNullable(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => typeof value === "number");
  return numeric.length > 0 ? Math.max(...numeric) : null;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}
