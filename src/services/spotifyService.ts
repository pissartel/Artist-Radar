import { debugLog, warnLog } from "../utils/logger.js";

export interface SpotifyArtistProfile {
  id: string;
  name: string;
  followers: number | null;
  popularity: number | null;
  genres: string[];
  spotifyUrl: string;
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
}

interface SpotifySearchArtistsResponse {
  artists?: {
    items?: SpotifyArtistApiResponse[];
  };
}

interface SpotifyRelatedArtistsResponse {
  artists?: SpotifyArtistApiResponse[];
}

interface SpotifyEnv {
  MOCK_AI?: string;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
}

type FetchLike = typeof fetch;

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
  fetchImpl: FetchLike = fetch
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
      spotifyUrl
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
    const token = await fetchSpotifyAccessToken(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET, fetchImpl);
    if (!token) {
      warnLog("spotify", "Spotify artist profile skipped: could not obtain an access token.", {
        spotifyClientIdPresent: true,
        spotifyClientSecretPresent: true
      });
      return null;
    }

    const response = await fetchImpl(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    debugLog("spotify", "get artist request status", { status: response.status, artistId });

    if (!response.ok) {
      warnLog("spotify", "Spotify artist profile request failed.", {
        artistId,
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
      followersTotalType: typeof artist.followers?.total,
      popularityType: typeof artist.popularity,
      genresIsArray: Array.isArray(artist.genres),
      rawGenresCount: Array.isArray(artist.genres) ? artist.genres.length : 0
    });

    const profile = {
      id: artist.id,
      name: artist.name,
      followers: typeof artist.followers?.total === "number" ? artist.followers.total : null,
      popularity: typeof artist.popularity === "number" ? artist.popularity : null,
      genres: Array.isArray(artist.genres) ? artist.genres : [],
      spotifyUrl: artist.external_urls?.spotify ?? spotifyUrl
    };
    debugLog("spotify", "Spotify artist profile normalized", {
      artistName: profile.name,
      followersCount: profile.followers,
      popularity: profile.popularity,
      genresCount: profile.genres.length
    });
    return profile;
  } catch {
    warnLog("spotify", "Spotify artist profile request failed.", { artistId });
    return null;
  }
}

export async function searchSpotifyArtists(
  query: string,
  limit = 10,
  env: SpotifyEnv = process.env,
  fetchImpl: FetchLike = fetch
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
    const token = await fetchSpotifyAccessToken(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET, fetchImpl);
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
    const artists = (data.artists?.items ?? []).map(mapSpotifyArtistApiResponse).filter((artist) => artist !== null);
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

export async function getSpotifyRelatedArtists(
  spotifyArtistId: string,
  env: SpotifyEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SpotifyArtistProfile[]> {
  const artistId = spotifyArtistId.trim();
  if (!artistId) {
    return [];
  }

  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    return [];
  }

  try {
    debugLog("spotify", "Spotify related artists request", { artistId });
    const token = await fetchSpotifyAccessToken(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET, fetchImpl);
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
      logRelatedArtistsUnavailable(artistId, response.status);
      return [];
    }

    const data = (await response.json()) as SpotifyRelatedArtistsResponse;
    const artists = (data.artists ?? []).map(mapSpotifyArtistApiResponse).filter((artist) => artist !== null);
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

function mapSpotifyArtistApiResponse(artist: SpotifyArtistApiResponse): SpotifyArtistProfile | null {
  if (!artist.id || !artist.name) {
    return null;
  }

  return {
    id: artist.id,
    name: artist.name,
    followers: typeof artist.followers?.total === "number" ? artist.followers.total : null,
    popularity: typeof artist.popularity === "number" ? artist.popularity : null,
    genres: Array.isArray(artist.genres) ? artist.genres : [],
    spotifyUrl: artist.external_urls?.spotify ?? `https://open.spotify.com/artist/${artist.id}`
  };
}

async function fetchSpotifyAccessToken(
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
