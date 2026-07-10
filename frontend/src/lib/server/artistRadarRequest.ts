import type { ArtistRadarRequest } from "@/types/artistRadar";

export interface RawArtistRadarRequestBody {
  artistName?: unknown;
  genre?: unknown;
  location?: unknown;
  enableBooking?: unknown;
  spotifyUrl?: unknown;
}

function isValidHttpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Shared body validation for the /api/artist-radar and /api/artist-analysis endpoints. */
export function parseArtistRadarRequestBody(body: RawArtistRadarRequestBody): ArtistRadarRequest | null {
  const { artistName, genre, location, enableBooking, spotifyUrl } = body;

  if (
    typeof artistName !== "string" || !artistName.trim() ||
    typeof genre !== "string" || !genre.trim() ||
    typeof location !== "string" || !location.trim()
  ) {
    return null;
  }

  if (enableBooking !== undefined && typeof enableBooking !== "boolean") {
    return null;
  }

  if (spotifyUrl !== undefined && typeof spotifyUrl !== "string") {
    return null;
  }

  const trimmedSpotifyUrl = spotifyUrl?.trim();

  return {
    artistName: artistName.trim(),
    genre: genre.trim(),
    location: location.trim(),
    enableBooking,
    ...(trimmedSpotifyUrl && isValidHttpUrl(trimmedSpotifyUrl) ? { spotifyUrl: trimmedSpotifyUrl } : {}),
  };
}
