import type { ArtistRadarRequest } from "@/types/artistRadar";

/**
 * Identifies every field that can change the analysis result. executionId is
 * deliberately excluded: it identifies a run, not the requested analysis.
 */
export function buildArtistRadarRequestKey(request: ArtistRadarRequest): string {
  return JSON.stringify({
    artistName: request.artistName,
    genre: request.genre,
    location: request.location,
    referenceCountry: request.referenceCountry ?? null,
    enableBooking: request.enableBooking ?? true,
    spotifyUrl: request.spotifyUrl ?? null,
    previewData: request.previewData === true,
    features: {
      chartmetricArtistEnrichment:
        request.features?.chartmetricArtistEnrichment === true,
    },
  });
}

export function isSameArtistRadarRequest(
  left: ArtistRadarRequest,
  right: ArtistRadarRequest
): boolean {
  return buildArtistRadarRequestKey(left) === buildArtistRadarRequestKey(right);
}

export function buildArtistRadarQueryKey(request: ArtistRadarRequest | null) {
  return ["artistRadar", request ? buildArtistRadarRequestKey(request) : null] as const;
}

export function selectRestoredArtistRadarRequest(
  current: ArtistRadarRequest | null | undefined,
  restored: ArtistRadarRequest | null,
  createExecutionId: () => string
): ArtistRadarRequest | null {
  if (!restored) return current ?? null;
  if (current && isSameArtistRadarRequest(current, restored)) return current;
  return { ...restored, executionId: createExecutionId() };
}
