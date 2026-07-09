import { debugLog, warnLog } from "../utils/logger.js";
import type { SizeSignalSource } from "../schemas.js";

export interface SpotifyArtistProfile {
  id: string;
  name: string;
  followers: number | null;
  popularity: number | null;
  genres: string[];
  spotifyUrl: string | null;
  images: string[];
  topTrackPopularityMax?: number | null;
  topTrackPopularityAvg?: number | null;
  topTrackCount?: number | null;
  sizeSignalSource?: SizeSignalSource;
}

export interface SpotifyCapabilities {
  artistFollowersAvailable: boolean;
  artistPopularityAvailable: boolean;
  artistGenresAvailable: boolean;
  relatedArtistsAvailable: boolean;
  topTracksAvailable: boolean;
}

interface SpotifyTokenResponse {
  access_token?: string;
}

interface SpotifyArtistApiResponse {
  id?: string;
  name?: string;
  followers?: {
    total?: number;
  };
  popularity?: number;
  genres?: string[];
  external_urls?: {
    spotify?: string;
  };
  images?: Array<{
    url?: string;
  }>;
}

interface SpotifyTopTrackApiResponse {
  popularity?: number;
}

interface SpotifyTopTracksResponse {
  tracks?: SpotifyTopTrackApiResponse[];
}

interface SpotifySearchArtistsResponse {
  artists?: {
    items?: SpotifyArtistApiResponse[];
  };
}

interface SpotifyRelatedArtistsResponse {
  artists?: SpotifyArtistApiResponse[];
}

interface SpotifySeveralArtistsResponse {
  artists?: Array<SpotifyArtistApiResponse | null>;
}

interface SpotifyEnv {
  MOCK_AI?: string;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  ENABLE_SPOTIFY_DEEP_ENRICHMENT?: string;
  ENABLE_SPOTIFY_RELATED_ARTISTS?: string;
  ENABLE_SPOTIFY_TOP_TRACKS?: string;
}

type FetchLike = typeof fetch;

export function createSpotifyCapabilities(env: SpotifyEnv = process.env): SpotifyCapabilities {
  return {
    artistFollowersAvailable: true,
    artistPopularityAvailable: true,
    artistGenresAvailable: true,
    relatedArtistsAvailable: env.ENABLE_SPOTIFY_RELATED_ARTISTS === "true",
    topTracksAvailable: env.ENABLE_SPOTIFY_TOP_TRACKS === "true"
  };
}

export function extractSpotifyArtistId(spotifyUrl: string): string | null {
  try {
    const url = new URL(spotifyUrl);
    const hostname = url.hostname.replace(/^www\./, "");
    if (hostname !== "open.spotify.com") {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    const artistIndex = segments.indexOf("artist");
    const artistId = artistIndex >= 0 ? segments[artistIndex + 1] : null;

    return artistId && /^[A-Za-z0-9]+$/.test(artistId) ? artistId : null;
  } catch {
    return null;
  }
}

export async function getSpotifyArtistProfile(
  spotifyUrl: string | null | undefined,
  env: SpotifyEnv = process.env,
  fetchImpl: FetchLike = fetch,
  capabilities: SpotifyCapabilities = createSpotifyCapabilities(env)
): Promise<SpotifyArtistProfile | null> {
  if (!spotifyUrl) {
    return null;
  }

  const artistId = extractSpotifyArtistId(spotifyUrl);
  debugLog("spotify", "extracted Spotify artist ID", { spotifyUrlPresent: true, artistId: artistId ?? null });
  if (!artistId) {
    return null;
  }

  if (env.MOCK_AI === "true") {
    return {
      id: artistId,
      name: "Mock Spotify Artist",
      followers: 1200,
      popularity: 18,
      genres: ["metalcore", "hardcore"],
      spotifyUrl,
      images: [],
      topTrackPopularityMax: null,
      topTrackPopularityAvg: null,
      topTrackCount: null,
      sizeSignalSource: "spotify_artist"
    };
  }

  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    debugLog("spotify", "Spotify credentials presence", {
      spotifyClientIdPresent: Boolean(env.SPOTIFY_CLIENT_ID),
      spotifyClientSecretPresent: Boolean(env.SPOTIFY_CLIENT_SECRET)
    });
    return null;
  }

  try {
    return getSpotifyArtistById(artistId, env, fetchImpl, spotifyUrl, capabilities);
  } catch {
    warnLog("spotify", "Spotify artist profile request failed.", { artistId });
    return null;
  }
}

export async function searchSpotifyArtists(
  query: string,
  limit = 10,
  env: SpotifyEnv = process.env,
  fetchImpl: FetchLike = fetch,
  capabilities: SpotifyCapabilities = createSpotifyCapabilities(env)
): Promise<SpotifyArtistProfile[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    return [];
  }

  try {
    debugLog("spotify", "Spotify artist search query", { query: trimmedQuery, limit });
    const token = await getSpotifyAccessToken(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET, fetchImpl);
    if (!token) {
      warnLog("spotify", "Spotify artist search skipped: could not obtain an access token.", {
        spotifyClientIdPresent: true,
        spotifyClientSecretPresent: true
      });
      return [];
    }

    const params = new URLSearchParams({
      q: trimmedQuery,
      type: "artist",
      limit: String(Math.max(1, Math.min(limit, 50)))
    });
    const response = await fetchImpl(`https://api.spotify.com/v1/search?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    debugLog("spotify", "Spotify artist search status", { query: trimmedQuery, status: response.status });

    if (!response.ok) {
      warnLog("spotify", "Spotify artist search failed.", {
        query: trimmedQuery,
        status: response.status
      });
      return [];
    }

    const data = (await response.json()) as SpotifySearchArtistsResponse;
    const artists = (data.artists?.items ?? []).map((artist) => mapSpotifyArtistApiResponse(artist, capabilities)).filter((artist) => artist !== null);
    debugLog("spotify", "Spotify artist search result count", { query: trimmedQuery, resultCount: artists.length });
    return artists;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLog("spotify", "Spotify artist search failed.", {
      query: trimmedQuery,
      error: message
    });
    return [];
  }
}

// Confidence-checked lookup for enrichment (main artist / similar artists),
// as opposed to searchSpotifyArtists which returns raw candidates for
// similar-artist discovery. Only returns a match when the normalized name is
// an exact match, to avoid attaching the wrong Spotify profile to a small
// artist that shares a name with a bigger act.
export async function searchSpotifyArtistByName(
  name: string,
  env: SpotifyEnv = process.env,
  fetchImpl: FetchLike = fetch,
  capabilities: SpotifyCapabilities = createSpotifyCapabilities(env)
): Promise<SpotifyArtistProfile | null> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return null;
  }

  const candidates = await searchSpotifyArtists(trimmedName, 5, env, fetchImpl, capabilities);
  const normalizedTarget = normalizeArtistNameForMatching(trimmedName);
  const confidentMatch = candidates.find((candidate) => normalizeArtistNameForMatching(candidate.name) === normalizedTarget);

  debugLog("spotify", "Spotify search-by-name confidence check", {
    name: trimmedName,
    candidateCount: candidates.length,
    confidentMatchFound: Boolean(confidentMatch)
  });

  return confidentMatch ?? null;
}

function normalizeArtistNameForMatching(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Batches lookups via Spotify's multi-artist endpoint (max 50 ids per call)
// so enrichment can resolve many similar artists without one request each.
export async function getSeveralSpotifyArtistsByIds(
  artistIds: string[],
  env: SpotifyEnv = process.env,
  fetchImpl: FetchLike = fetch,
  capabilities: SpotifyCapabilities = createSpotifyCapabilities(env)
): Promise<SpotifyArtistProfile[]> {
  const ids = Array.from(new Set(artistIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) {
    return [];
  }

  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    return [];
  }

  const token = await getSpotifyAccessToken(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET, fetchImpl);
  if (!token) {
    warnLog("spotify", "Several Spotify artists lookup skipped: could not obtain an access token.", {
      spotifyClientIdPresent: true,
      spotifyClientSecretPresent: true
    });
    return [];
  }

  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) {
    batches.push(ids.slice(i, i + 50));
  }

  const results: SpotifyArtistProfile[] = [];
  for (const batch of batches) {
    const response = await fetchImpl(`https://api.spotify.com/v1/artists?ids=${batch.map(encodeURIComponent).join(",")}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    debugLog("spotify", "several artists request status", { status: response.status, batchSize: batch.length });

    if (!response.ok) {
      warnLog("spotify", "Several Spotify artists lookup failed.", {
        status: response.status,
        batchSize: batch.length
      });
      continue;
    }

    const data = (await response.json()) as SpotifySeveralArtistsResponse;
    const artists = (data.artists ?? [])
      .filter((artist): artist is SpotifyArtistApiResponse => Boolean(artist))
      .map((artist) => mapSpotifyArtistApiResponse(artist, capabilities))
      .filter((artist): artist is SpotifyArtistProfile => artist !== null);
    results.push(...artists);
  }

  debugLog("spotify", "several artists result count", { requested: ids.length, resolved: results.length });
  return results;
}

export async function getSpotifyRelatedArtists(
  spotifyArtistId: string,
  env: SpotifyEnv = process.env,
  fetchImpl: FetchLike = fetch,
  capabilities: SpotifyCapabilities = createSpotifyCapabilities(env)
): Promise<SpotifyArtistProfile[]> {
  const artistId = spotifyArtistId.trim();
  if (!artistId) {
    return [];
  }

  if (env.ENABLE_SPOTIFY_RELATED_ARTISTS !== "true") {
    capabilities.relatedArtistsAvailable = false;
    debugLog("spotify", "Spotify related artists disabled by configuration", {
      relatedArtistsAvailable: capabilities.relatedArtistsAvailable
    });
    return [];
  }

  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    return [];
  }

  try {
    debugLog("spotify", "Spotify related artists request", { artistId });
    const token = await getSpotifyAccessToken(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET, fetchImpl);
    if (!token) {
      warnLog("spotify", "Spotify related artists skipped: could not obtain an access token.", {
        spotifyClientIdPresent: true,
        spotifyClientSecretPresent: true
      });
      return [];
    }

    const response = await fetchImpl(`https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}/related-artists`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    debugLog("spotify", "Spotify related artists status", { artistId, status: response.status });

    if (!response.ok) {
      capabilities.relatedArtistsAvailable = false;
      logRelatedArtistsUnavailable(artistId, response.status);
      return [];
    }

    const data = (await response.json()) as SpotifyRelatedArtistsResponse;
    const artists = (data.artists ?? []).map((artist) => mapSpotifyArtistApiResponse(artist, capabilities)).filter((artist) => artist !== null);
    if (artists.length === 0) {
      capabilities.relatedArtistsAvailable = false;
    }
    debugLog("spotify", "Spotify related artists result count", { artistId, resultCount: artists.length });
    return artists;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLog("spotify", "Spotify related artists unavailable.", {
      artistId,
      error: message
    });
    return [];
  }
}

function mapSpotifyArtistApiResponse(
  artist: SpotifyArtistApiResponse,
  capabilities: SpotifyCapabilities = createSpotifyCapabilities()
): SpotifyArtistProfile | null {
  if (!artist.id || !artist.name) {
    return null;
  }

  debugLog("spotify", "raw artist response summary", {
    hasFollowersObject: Boolean(artist.followers),
    followersTotal: artist.followers?.total ?? null,
    followersTotalType: typeof artist.followers?.total,
    popularity: artist.popularity ?? null,
    popularityType: typeof artist.popularity,
    genresIsArray: Array.isArray(artist.genres),
    genresCount: Array.isArray(artist.genres) ? artist.genres.length : 0
  });

  if (typeof artist.followers?.total !== "number") {
    capabilities.artistFollowersAvailable = false;
  }
  if (typeof artist.popularity !== "number") {
    capabilities.artistPopularityAvailable = false;
  }
  if (!Array.isArray(artist.genres) || artist.genres.length === 0) {
    capabilities.artistGenresAvailable = false;
  }

  return {
    id: artist.id,
    name: artist.name,
    followers: typeof artist.followers?.total === "number" ? artist.followers.total : null,
    popularity: typeof artist.popularity === "number" ? artist.popularity : null,
    genres: Array.isArray(artist.genres) ? artist.genres : [],
    spotifyUrl: artist.external_urls?.spotify ?? null,
    images: Array.isArray(artist.images) ? artist.images.map((image) => image.url).filter((url): url is string => Boolean(url)) : [],
    topTrackPopularityMax: null,
    topTrackPopularityAvg: null,
    topTrackCount: null,
    sizeSignalSource: determineSpotifySizeSignalSource({
      followers: typeof artist.followers?.total === "number" ? artist.followers.total : null,
      popularity: typeof artist.popularity === "number" ? artist.popularity : null,
      topTrackPopularityMax: null,
      topTrackPopularityAvg: null
    })
  };
}

export async function getSpotifyArtistById(
  artistId: string,
  env: SpotifyEnv = process.env,
  fetchImpl: FetchLike = fetch,
  fallbackSpotifyUrl?: string,
  capabilities: SpotifyCapabilities = createSpotifyCapabilities(env)
): Promise<SpotifyArtistProfile | null> {
  const trimmedArtistId = artistId.trim();
  if (!trimmedArtistId || !env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    return null;
  }

  const token = await getSpotifyAccessToken(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET, fetchImpl);
  if (!token) {
    warnLog("spotify", "Spotify artist profile skipped: could not obtain an access token.", {
      spotifyClientIdPresent: true,
      spotifyClientSecretPresent: true
    });
    return null;
  }

  const response = await fetchImpl(`https://api.spotify.com/v1/artists/${trimmedArtistId}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  debugLog("spotify", "get artist request status", { status: response.status, artistId: trimmedArtistId });

  if (!response.ok) {
    warnLog("spotify", "Spotify artist profile request failed.", {
      artistId: trimmedArtistId,
      status: response.status
    });
    return null;
  }

  const artist = (await response.json()) as SpotifyArtistApiResponse;
  if (!artist.id || !artist.name) {
    return null;
  }

  debugLog("spotify", "raw artist response summary", {
    hasFollowersObject: Boolean(artist.followers),
    followersTotal: artist.followers?.total ?? null,
    popularity: artist.popularity ?? null,
    genresCount: Array.isArray(artist.genres) ? artist.genres.length : 0
  });

  const profile: SpotifyArtistProfile = {
    id: artist.id,
    name: artist.name,
    followers: typeof artist.followers?.total === "number" ? artist.followers.total : null,
    popularity: typeof artist.popularity === "number" ? artist.popularity : null,
    genres: Array.isArray(artist.genres) ? artist.genres : [],
    spotifyUrl: artist.external_urls?.spotify ?? null,
    images: Array.isArray(artist.images) ? artist.images.map((image) => image.url).filter((url): url is string => Boolean(url)) : [],
    topTrackPopularityMax: null,
    topTrackPopularityAvg: null,
    topTrackCount: null,
    sizeSignalSource: "unknown"
  };

  if (typeof artist.followers?.total !== "number") {
    capabilities.artistFollowersAvailable = false;
  }
  if (typeof artist.popularity !== "number") {
    capabilities.artistPopularityAvailable = false;
  }
  if (!Array.isArray(artist.genres) || artist.genres.length === 0) {
    capabilities.artistGenresAvailable = false;
  }

  let topTracksStatus: number | "skipped" | null = "skipped";
  if (env.ENABLE_SPOTIFY_TOP_TRACKS === "true" && profile.popularity === null && capabilities.topTracksAvailable !== false) {
    const topTrackStats = await fetchSpotifyArtistTopTrackStats(trimmedArtistId, token, fetchImpl);
    topTracksStatus = topTrackStats?.status ?? null;
    if (topTrackStats) {
      profile.topTrackPopularityMax = topTrackStats.topTrackPopularityMax;
      profile.topTrackPopularityAvg = topTrackStats.topTrackPopularityAvg;
      profile.topTrackCount = topTrackStats.topTrackCount;
      if (topTrackStats.status >= 400) {
        capabilities.topTracksAvailable = false;
      }
    } else {
      capabilities.topTracksAvailable = false;
    }
  } else if (env.ENABLE_SPOTIFY_TOP_TRACKS !== "true") {
    capabilities.topTracksAvailable = false;
  }

  profile.sizeSignalSource = determineSpotifySizeSignalSource(profile);

  debugLog("spotify", "Spotify artist profile normalized", {
    artistName: profile.name,
    followersCount: profile.followers,
    popularity: profile.popularity,
    genresCount: profile.genres.length
  });
  debugLog("spotify", "Spotify artist size signal summary", {
    artistName: profile.name,
    artistPopularityPresent: profile.popularity !== null,
    followersPresent: profile.followers !== null,
    topTracksRequestStatus: topTracksStatus,
    topTrackPopularityMax: profile.topTrackPopularityMax,
    topTrackPopularityAvg: profile.topTrackPopularityAvg,
    topTrackCount: profile.topTrackCount,
    chosenSizeSignalSource: profile.sizeSignalSource
  });
  return profile;
}

async function fetchSpotifyArtistTopTrackStats(
  artistId: string,
  token: string,
  fetchImpl: FetchLike
): Promise<
  | {
      status: number;
      topTrackPopularityMax: number | null;
      topTrackPopularityAvg: number | null;
      topTrackCount: number | null;
    }
  | null
> {
  const response = await fetchImpl(`https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}/top-tracks?market=US`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  debugLog("spotify", "Spotify top tracks request status", { artistId, status: response.status });

  if (!response.ok) {
    return {
      status: response.status,
      topTrackPopularityMax: null,
      topTrackPopularityAvg: null,
      topTrackCount: null
    };
  }

  const data = (await response.json()) as SpotifyTopTracksResponse;
  const pops = (data.tracks ?? [])
    .map((track) => (typeof track.popularity === "number" ? track.popularity : null))
    .filter((value): value is number => value !== null);
  const topTrackCount = data.tracks?.length ?? 0;
  const topTrackPopularityMax = pops.length > 0 ? Math.max(...pops) : null;
  const topTrackPopularityAvg = pops.length > 0 ? Math.round(pops.reduce((sum, value) => sum + value, 0) / pops.length) : null;

  debugLog("spotify", "Spotify top tracks normalized", {
    artistId,
    topTrackCount,
    topTrackPopularityMax,
    topTrackPopularityAvg
  });

  return {
    status: response.status,
    topTrackPopularityMax,
    topTrackPopularityAvg,
    topTrackCount
  };
}

export async function getSpotifyAccessToken(
  clientId: string,
  clientSecret: string,
  fetchImpl: FetchLike
): Promise<string | null> {
  debugLog("spotify", "Spotify token request", {
    spotifyClientIdPresent: Boolean(clientId),
    spotifyClientSecretPresent: Boolean(clientSecret)
  });
  const response = await fetchImpl("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });

  if (!response.ok) {
    debugLog("spotify", "Spotify token request failed", { status: response.status });
    return null;
  }

  const data = (await response.json()) as SpotifyTokenResponse;
  debugLog("spotify", "Spotify token request success", { status: response.status });
  return data.access_token ?? null;
}

function logRelatedArtistsUnavailable(artistId: string, status: number): void {
  const payload = {
    artistId,
    status,
    unavailableReason: status === 403 ? "forbidden" : status === 404 ? "not_found" : status === 429 ? "rate_limited" : "request_failed"
  };

  if (status === 403 || status === 404 || status === 429) {
    debugLog("spotify", "Spotify related artists unavailable.", payload);
    return;
  }

  warnLog("spotify", "Spotify related artists unavailable.", payload);
}

function determineSpotifySizeSignalSource(profile: Pick<SpotifyArtistProfile, "followers" | "popularity" | "topTrackPopularityMax" | "topTrackPopularityAvg">): SizeSignalSource {
  if (typeof profile.popularity === "number") {
    return "spotify_artist";
  }

  if (typeof profile.followers === "number") {
    return "spotify_artist";
  }

  if (typeof profile.topTrackPopularityMax === "number" || typeof profile.topTrackPopularityAvg === "number") {
    return "spotify_tracks";
  }

  return "unknown";
}
