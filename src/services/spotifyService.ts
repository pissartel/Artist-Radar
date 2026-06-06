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
    return null;
  }

  try {
    const token = await fetchSpotifyAccessToken(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET, fetchImpl);
    if (!token) {
      return null;
    }

    const response = await fetchImpl(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return null;
    }

    const artist = (await response.json()) as SpotifyArtistApiResponse;
    if (!artist.id || !artist.name) {
      return null;
    }

    return {
      id: artist.id,
      name: artist.name,
      followers: typeof artist.followers?.total === "number" ? artist.followers.total : null,
      popularity: typeof artist.popularity === "number" ? artist.popularity : null,
      genres: Array.isArray(artist.genres) ? artist.genres : [],
      spotifyUrl: artist.external_urls?.spotify ?? spotifyUrl
    };
  } catch {
    return null;
  }
}

async function fetchSpotifyAccessToken(
  clientId: string,
  clientSecret: string,
  fetchImpl: FetchLike
): Promise<string | null> {
  const response = await fetchImpl("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as SpotifyTokenResponse;
  return data.access_token ?? null;
}
