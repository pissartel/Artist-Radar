import { ArtistInputSchema, type ArtistInput, type Mode } from "./schemas.js";

export interface CliArtistInputOptions {
  artist: string;
  city?: string;
  genre?: string;
  target?: string;
  links?: string[];
  limit?: string | number;
  spotifyUrl?: string;
  youtubeUrl?: string;
  instagramUrl?: string;
}

export interface WebBookingArtistInputRequest {
  artistName: string;
  genre: string;
  location: string;
  referenceCountry?: string;
  spotifyUrl?: string;
}

export function buildCliArtistInput(
  mode: Mode,
  options: CliArtistInputOptions
): ArtistInput {
  return ArtistInputSchema.parse({
    mode,
    artist: options.artist,
    city: options.city?.trim() || "unknown",
    genre: options.genre?.trim() || "unknown",
    target: options.target ?? null,
    links: options.links ?? [],
    limit: options.limit ?? 10,
    spotifyUrl: options.spotifyUrl ?? null,
    youtubeUrl: options.youtubeUrl ?? null,
    instagramUrl: options.instagramUrl ?? null,
  });
}

export function buildWebBookingArtistInput(
  request: WebBookingArtistInputRequest
): ArtistInput {
  return ArtistInputSchema.parse({
    mode: "booking",
    artist: request.artistName,
    city: request.location,
    genre: request.genre,
    target: request.referenceCountry ?? null,
    links: [],
    limit: 20,
    spotifyUrl: request.spotifyUrl ?? null,
    youtubeUrl: null,
    instagramUrl: null,
  });
}
