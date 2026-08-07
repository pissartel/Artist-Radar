import { debugLog, warnLog } from "../utils/logger.js";

export interface DeezerArtistProfile {
  id: number;
  name: string;
  fans: number | null;
  deezerUrl: string | null;
  imageUrl: string | null;
}

interface DeezerArtistApiResponse {
  id?: number;
  name?: string;
  nb_fan?: number;
  link?: string;
  picture_xl?: string;
  picture_big?: string;
  picture_medium?: string;
}

interface DeezerSearchArtistResponse {
  data?: DeezerArtistApiResponse[];
}

interface DeezerEnv {
  MOCK_AI?: string;
  ENABLE_DEEZER_ARTIST_SEARCH?: string;
}

type FetchLike = typeof fetch;

export function extractDeezerArtistId(deezerUrl: string): number | null {
  try {
    const url = new URL(deezerUrl);
    const hostname = url.hostname.replace(/^www\./, "");
    if (hostname !== "deezer.com" && !hostname.endsWith(".deezer.com")) {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    const artistIndex = segments.indexOf("artist");
    const rawId = artistIndex >= 0 ? segments[artistIndex + 1] : null;
    const id = rawId ? Number.parseInt(rawId, 10) : Number.NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function getDeezerArtistProfile(
  deezerUrl: string | null | undefined,
  env: DeezerEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<DeezerArtistProfile | null> {
  if (!deezerUrl) {
    return null;
  }

  const id = extractDeezerArtistId(deezerUrl);
  if (!id) {
    return null;
  }

  if (env.MOCK_AI === "true") {
    return {
      id,
      name: "Mock Deezer Artist",
      fans: 950,
      deezerUrl,
      imageUrl: null
    };
  }

  try {
    const response = await fetchImpl(`https://api.deezer.com/artist/${encodeURIComponent(String(id))}`);
    debugLog("deezer", "Deezer artist profile status", { artistId: id, status: response.status });
    if (!response.ok) {
      warnLog("deezer", "Deezer artist profile lookup failed.", { artistId: id, status: response.status });
      return null;
    }

    return mapDeezerArtist(await response.json() as DeezerArtistApiResponse);
  } catch (error) {
    warnLog("deezer", "Deezer artist profile lookup failed.", {
      artistId: id,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export async function searchDeezerArtistByName(
  name: string,
  env: DeezerEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<DeezerArtistProfile | null> {
  const trimmedName = name.trim();
  if (!trimmedName || env.ENABLE_DEEZER_ARTIST_SEARCH !== "true") {
    return null;
  }

  if (env.MOCK_AI === "true") {
    return {
      id: 123,
      name: trimmedName,
      fans: 950,
      deezerUrl: "https://www.deezer.com/artist/123",
      imageUrl: null
    };
  }

  try {
    const params = new URLSearchParams({ q: trimmedName, limit: "5" });
    const response = await fetchImpl(`https://api.deezer.com/search/artist?${params.toString()}`);
    debugLog("deezer", "Deezer artist search status", { artistName: trimmedName, status: response.status });
    if (!response.ok) {
      warnLog("deezer", "Deezer artist search failed.", { artistName: trimmedName, status: response.status });
      return null;
    }

    const data = await response.json() as DeezerSearchArtistResponse;
    const normalizedTarget = normalizeArtistName(trimmedName);
    const exactMatch = (data.data ?? [])
      .map(mapDeezerArtist)
      .filter((artist): artist is DeezerArtistProfile => artist !== null)
      .find((artist) => normalizeArtistName(artist.name) === normalizedTarget);

    debugLog("deezer", "Deezer search-by-name confidence check", {
      artistName: trimmedName,
      candidateCount: data.data?.length ?? 0,
      confidentMatchFound: Boolean(exactMatch)
    });

    return exactMatch ?? null;
  } catch (error) {
    warnLog("deezer", "Deezer artist search failed.", {
      artistName: trimmedName,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function mapDeezerArtist(artist: DeezerArtistApiResponse): DeezerArtistProfile | null {
  if (!artist.id || !artist.name) {
    return null;
  }

  return {
    id: artist.id,
    name: artist.name,
    fans: typeof artist.nb_fan === "number" ? artist.nb_fan : null,
    deezerUrl: artist.link ?? null,
    imageUrl: artist.picture_xl ?? artist.picture_big ?? artist.picture_medium ?? null
  };
}

function normalizeArtistName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
