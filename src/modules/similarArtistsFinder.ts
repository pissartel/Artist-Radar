import {
  SimilarArtistSchema,
  type ArtistProfile,
  type ArtistTier,
  type SimilarArtist,
  type SimilarArtistPossibleUse,
  type SimilarArtistSource
} from "../schemas.js";
import {
  extractSpotifyArtistId,
  getSpotifyRelatedArtists,
  searchSpotifyArtists,
  type SpotifyArtistProfile
} from "../services/spotifyService.js";
import { debugLog } from "../utils/logger.js";

export interface SimilarArtistsFinderInput {
  profile: ArtistProfile;
  target?: string | null;
  genre?: string | null;
  city?: string | null;
  links?: string[];
  userProvidedSimilarArtists?: string[];
  env?: {
    MOCK_AI?: string;
    DEBUG_SIMILAR_ARTISTS?: string;
    SPOTIFY_CLIENT_ID?: string;
    SPOTIFY_CLIENT_SECRET?: string;
  };
  spotifyRelatedArtists?: (spotifyArtistId: string) => Promise<SpotifyArtistProfile[]>;
  spotifySearch?: (query: string, limit: number) => Promise<SpotifyArtistProfile[]>;
}

export interface ArtistMetrics {
  followers: number | null;
  popularity: number | null;
}

export interface SizeRelevanceResult {
  artistTier: ArtistTier;
  score: number;
}

export type SimilarArtistsByTier = Record<ArtistTier, SimilarArtist[]>;

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

const GENRE_SYNONYMS: Record<string, string[]> = {
  "hip hop": ["rap"],
  rap: ["hip hop"],
  electronic: ["electro"],
  electro: ["electronic"],
  metal: ["heavy metal"],
  "heavy metal": ["metal"],
  punk: ["punk rock"],
  "punk rock": ["punk"],
  indie: ["indie rock"],
  "indie rock": ["indie"],
  pop: ["pop rock"],
  "pop rock": ["pop"]
};

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
    estimatedFollowers: 18000,
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
  debugLog("similar-artists", "input artist", {
    artistName: input.profile.artistName ?? input.profile.spotifyArtistName ?? null,
    genres: input.profile.genres,
    userMetrics: getUserMetrics(input.profile)
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

  const spotifyArtists = await findSpotifySimilarArtists(input, env);
  const artists = [...userProvided, ...spotifyArtists].map((artist) => SimilarArtistSchema.parse(artist));
  debugTierCounts(artists);
  return artists;
}

export function groupSimilarArtistsByTier(similarArtists: SimilarArtist[]): SimilarArtistsByTier {
  return similarArtists.reduce<SimilarArtistsByTier>(
    (groups, artist) => {
      groups[artist.artistTier].push(artist);
      return groups;
    },
    { small: [], medium: [], large: [], unknown: [] }
  );
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
  const candidateScore = getAudienceScore(candidateMetrics.followers, candidateMetrics.popularity);

  if (candidateScore === null) {
    return { artistTier: "unknown", score: 35 };
  }

  const userScore = getAudienceScore(userMetrics.followers, userMetrics.popularity);
  if (userScore === null) {
    const artistTier = determineAbsoluteArtistTier(candidateMetrics.followers, candidateMetrics.popularity);
    return { artistTier, score: scoreForTier(artistTier) };
  }

  if (candidateScore <= userScore * 1.5) {
    return { artistTier: "small", score: 90 };
  }

  if (candidateScore <= userScore * 6) {
    return { artistTier: "medium", score: 70 };
  }

  return { artistTier: "large", score: 35 };
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

  if (
    normalizedTarget &&
    ((candidateCity && normalizedTarget.includes(candidateCity)) ||
      (candidateCountry && normalizedTarget.includes(candidateCountry)))
  ) {
    return 75;
  }

  if (!candidateCity && !candidateCountry) {
    return 45;
  }

  return 55;
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

export function mapSpotifyArtistToSimilarArtist(
  artist: SpotifyArtistProfile,
  input: Pick<SimilarArtistsFinderInput, "profile" | "genre" | "city" | "target">,
  source: Extract<SimilarArtistSource, "spotify_related" | "spotify_search"> = "spotify_search"
): SimilarArtist {
  const userGenres = collectUserGenres(input);
  const genreRelevance = scoreGenreRelevanceWithContext(userGenres, artist.genres, artist.name, null);
  const size = scoreSizeRelevance(getUserMetrics(input.profile), {
    followers: artist.followers,
    popularity: artist.popularity
  });
  const sceneRelevance = scoreSceneRelevance({ city: null, country: null }, input.target, input.city);
  const possibleUse = possibleUseForTier(size.artistTier);
  const totalRelevance = calculateTotalRelevance(genreRelevance, size.score, sceneRelevance, source);
  const sharedGenres = findSharedGenres(userGenres, artist.genres);
  const genreText =
    sharedGenres.length > 0
      ? `Shared or adjacent genres: ${sharedGenres.join(", ")}.`
      : "Genre overlap is limited; retained only if overall similarity is still useful.";

  return {
    name: artist.name,
    url: artist.spotifyUrl,
    spotifyId: artist.id,
    genres: artist.genres,
    city: null,
    country: null,
    source,
    reason: `Found through Spotify ${source === "spotify_related" ? "Related Artists" : "artist search"} and ranked by genre, size and scene relevance. ${genreText}`,
    confidence: calculateConfidence(genreRelevance, artist.followers !== null || artist.popularity !== null, source),
    artistTier: size.artistTier,
    estimatedFollowers: artist.followers,
    estimatedPopularity: artist.popularity,
    genreRelevance,
    sizeRelevance: size.score,
    sceneRelevance,
    totalRelevance,
    relevanceToUserArtist: totalRelevance,
    possibleUse,
    estimatedLevel: artistTierToEstimatedLevel(size.artistTier),
    matchedQuery: null,
    searchRelevanceBoost: 0
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
        artist.genres,
        artist.name,
        match.matchedQuery
      );
      mapped.totalRelevance = calculateTotalRelevance(
        mapped.genreRelevance,
        mapped.sizeRelevance,
        mapped.sceneRelevance,
        source,
        match.searchRelevanceBoost
      );
      mapped.relevanceToUserArtist = mapped.totalRelevance;
      return mapped;
    });
  debugLog("similar-artists", "candidates before filtering", { count: mapped.length });

  const filtered = mapped
    .filter((artist) => {
      const hasCandidateGenres = artist.genres.length > 0;
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
      if (left.artistTier !== right.artistTier) {
        return tierPriority(left.artistTier) - tierPriority(right.artistTier);
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
  const possibleUse = possibleUseForTier(size.artistTier);

  return {
    name: artist.name,
    url: null,
    spotifyId: null,
    genres: artist.genres,
    city: artist.city ?? input.city ?? input.profile.city ?? null,
    country: artist.country,
    source: "mock",
    reason: buildReason(size.artistTier, possibleUse, totalRelevance, artist.city ?? input.city ?? input.profile.city ?? null),
    confidence: calculateConfidence(genreRelevance, true, "mock"),
    artistTier: size.artistTier,
    estimatedFollowers: artist.estimatedFollowers,
    estimatedPopularity: artist.estimatedPopularity,
    genreRelevance,
    sizeRelevance: size.score,
    sceneRelevance,
    totalRelevance,
    relevanceToUserArtist: totalRelevance,
    possibleUse,
    estimatedLevel: artistTierToEstimatedLevel(size.artistTier)
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
      return {
        name,
        url: null,
        spotifyId: null,
        genres: input.profile.genres,
        city: input.city ?? input.profile.city ?? null,
        country: input.profile.country ?? null,
        source: "user",
        reason: `User-provided similar artist for comparison in ${input.target ?? input.city ?? input.profile.city ?? "the requested market"}.`,
        confidence: 0.9,
        artistTier: "unknown",
        estimatedFollowers: null,
        estimatedPopularity: null,
        genreRelevance: 60,
        sizeRelevance: 35,
        sceneRelevance,
        totalRelevance: 55,
        relevanceToUserArtist: 55,
        possibleUse: "unknown",
        estimatedLevel: null
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
  searchRelevanceBoost = 0
): number {
  const providerBoost = source === "spotify_related" ? 8 : source === "mock" ? 4 : 0;
  return clampScore(
    Math.round(genreRelevance * 0.5 + sizeRelevance * 0.3 + sceneRelevance * 0.2 + providerBoost + searchRelevanceBoost)
  );
}

function calculateConfidence(
  genreRelevance: number,
  hasMetrics: boolean,
  source: SimilarArtistSource
): number {
  const providerScore = source === "spotify_related" ? 0.2 : source === "spotify_search" ? 0.1 : 0.05;
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
  const values: number[] = [];

  if (typeof followers === "number") {
    values.push(followers);
  }

  if (typeof popularity === "number") {
    values.push(popularity * 1000);
  }

  return values.length > 0 ? Math.max(...values) : null;
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
  debugLog("similar-artists", "final tier counts", {
    small: grouped.small.length,
    medium: grouped.medium.length,
    large: grouped.large.length,
    unknown: grouped.unknown.length
  });
}

function logSimilarArtistCandidate(
  artist: SimilarArtist & { matchedQuery?: string | null; searchRelevanceBoost?: number }
): Record<string, unknown> {
  return {
    name: artist.name,
    candidateGenres: artist.genres,
    matchedQuery: artist.matchedQuery ?? null,
    genreRelevance: artist.genreRelevance,
    estimatedPopularity: artist.estimatedPopularity,
    estimatedFollowers: artist.estimatedFollowers,
    artistTier: artist.artistTier,
    totalRelevance: artist.totalRelevance
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

function collectUserGenres(input: Pick<SimilarArtistsFinderInput, "profile" | "genre">): string[] {
  return uniqueStrings([input.genre ?? "", ...input.profile.genres, ...input.profile.spotifyGenres]);
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

function expandGenres(genres: string[]): { exact: Set<string>; expanded: Set<string>; tokens: Set<string> } {
  const exact = new Set<string>();
  const expanded = new Set<string>();
  const tokens = new Set<string>();

  for (const genre of genres) {
    const normalized = normalizeText(genre);
    if (!normalized) {
      continue;
    }

    exact.add(normalized);
    expanded.add(normalized);
    for (const synonym of GENRE_SYNONYMS[normalized] ?? []) {
      expanded.add(normalizeText(synonym));
    }
    for (const token of normalized.split(" ").filter(Boolean)) {
      tokens.add(token);
    }
  }

  return { exact, expanded, tokens };
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

function maxNullable(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => typeof value === "number");
  return numeric.length > 0 ? Math.max(...numeric) : null;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}
