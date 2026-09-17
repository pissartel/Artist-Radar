import type { ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";

const STORAGE_KEY = "artistRadarResponse:v1";
const ANALYSIS_CACHE_VERSION = "booking-v3";

interface CachedArtistRadarResponse {
  requestKey: string;
  data: ArtistRadarResponse;
}

function buildRequestKey(request: ArtistRadarRequest): string {
  return JSON.stringify({
    analysisCacheVersion: ANALYSIS_CACHE_VERSION,
    artistName: request.artistName,
    genre: request.genre,
    location: request.location,
    referenceCountry: request.referenceCountry ?? null,
    enableBooking: request.enableBooking,
    spotifyUrl: request.spotifyUrl,
    features: request.features,
    previewData: request.previewData === true,
  });
}

function isCachedResponse(value: unknown): value is CachedArtistRadarResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.requestKey === "string" &&
    typeof candidate.data === "object" &&
    candidate.data !== null &&
    !Array.isArray(candidate.data)
  );
}

export function readArtistRadarResponse(
  request: ArtistRadarRequest
): ArtistRadarResponse | undefined {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;

    const cached: unknown = JSON.parse(raw);
    if (!isCachedResponse(cached) || cached.requestKey !== buildRequestKey(request)) {
      return undefined;
    }

    return cached.data;
  } catch {
    return undefined;
  }
}

export function writeArtistRadarResponse(
  request: ArtistRadarRequest,
  data: ArtistRadarResponse
): void {
  try {
    const cached: CachedArtistRadarResponse = {
      requestKey: buildRequestKey(request),
      data,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // Storage can be disabled or full. The in-memory query cache still works.
  }
}

export function clearArtistRadarResponse(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // A fresh analysis can still run when storage is unavailable.
  }
}
