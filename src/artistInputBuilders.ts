import { ArtistInputSchema, type ArtistInput, type Mode } from "./schemas.js";

export interface CliArtistInputOptions {
  artist: string;
  city?: string;
  country?: string;
  genre?: string;
  target?: string;
  links?: string[];
  limit?: string | number;
  spotifyUrl?: string;
  deezerUrl?: string;
  youtubeUrl?: string;
  instagramUrl?: string;
  streamingProfilesFound?: boolean;
  developmentStage?: "pre_release" | "emerging" | "developing" | "established";
  influences?: string[];
}

export interface WebBookingArtistInputRequest {
  artistName: string;
  genre: string;
  location: string;
  referenceCountry?: string;
  spotifyUrl?: string;
  deezerUrl?: string;
  streamingProfilesFound?: boolean;
  developmentStage?: "pre_release" | "emerging" | "developing" | "established";
  influences?: string[];
}

export function buildCliArtistInput(
  mode: Mode,
  options: CliArtistInputOptions
): ArtistInput {
  return ArtistInputSchema.parse({
    mode,
    artist: options.artist,
    city: options.city?.trim() || "unknown",
    country: options.country?.trim() || null,
    genre: options.genre?.trim() || "unknown",
    target: options.target ?? null,
    links: options.links ?? [],
    limit: options.limit ?? 10,
    spotifyUrl: options.spotifyUrl ?? null,
    deezerUrl: options.deezerUrl ?? null,
    youtubeUrl: options.youtubeUrl ?? null,
    instagramUrl: options.instagramUrl ?? null,
    streamingProfilesFound: options.streamingProfilesFound,
    developmentStage: options.developmentStage,
    influences: options.influences ?? [],
  });
}

export function buildWebBookingArtistInput(
  request: WebBookingArtistInputRequest
): ArtistInput {
  return ArtistInputSchema.parse({
    mode: "booking",
    artist: request.artistName,
    city: request.location,
    country: request.referenceCountry ?? null,
    genre: request.genre,
    target: request.referenceCountry ?? null,
    links: [],
    limit: 20,
    spotifyUrl: request.spotifyUrl ?? null,
    deezerUrl: request.deezerUrl ?? null,
    youtubeUrl: null,
    instagramUrl: null,
    streamingProfilesFound: request.streamingProfilesFound,
    developmentStage: request.developmentStage,
    influences: request.influences ?? [],
  });
}
