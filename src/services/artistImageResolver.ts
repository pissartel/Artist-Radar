import type { ImageSource } from "../schemas.js";

// Confidence assigned to an image when it comes from a given trusted source.
// Spotify is the only source wired up today; other trusted providers can be
// added here later without touching callers or the frontend.
const SOURCE_CONFIDENCE: Record<Exclude<ImageSource, null>, number> = {
  spotify: 0.9,
  lastfm: 0.6,
  musicbrainz: 0.5,
  website: 0.4,
  manual: 1,
  fallback: 0.2
};

export interface ArtistImageSourceInput {
  spotify?: { imageUrl: string | null } | null;
}

export interface ResolvedArtistImage {
  imageUrl: string | null;
  imageSource: ImageSource;
  imageConfidence: number | null;
}

// Picks the highest-priority trusted image available across known sources.
// Spotify is checked first; if no Spotify image exists, imageUrl stays null
// rather than falling back to arbitrary/unverified sources.
export function resolveArtistImage(sources: ArtistImageSourceInput): ResolvedArtistImage {
  const spotifyImageUrl = sources.spotify?.imageUrl ?? null;
  if (spotifyImageUrl) {
    return {
      imageUrl: spotifyImageUrl,
      imageSource: "spotify",
      imageConfidence: SOURCE_CONFIDENCE.spotify
    };
  }

  return {
    imageUrl: null,
    imageSource: null,
    imageConfidence: null
  };
}
