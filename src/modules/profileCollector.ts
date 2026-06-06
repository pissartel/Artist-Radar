import {
  ArtistInputSchema,
  ArtistProfileSchema,
  type ArtistInput,
  type ArtistProfile,
  type EstimatedArtistLevel,
  type PlatformStats,
  type SocialLinks
} from "../schemas.js";
import { getSpotifyArtistProfile, type SpotifyArtistProfile } from "../services/spotifyService.js";
import { getYouTubeChannelStats, type YouTubeChannelStats } from "../services/youtubeService.js";
import { debugLog } from "../utils/logger.js";

export interface ArtistLevelThresholds {
  developingMinPopularity: number;
  establishedPopularity: number;
  strongEstablishedPopularity: number;
  developingMinFollowers: number;
  establishedFollowers: number;
  strongEstablishedFollowers: number;
}

// Keep these thresholds centralized so future tuning can happen without changing
// the profile collection flow. "Strong" thresholds avoid promoting an artist to
// established from one borderline metric.
export const DEFAULT_ARTIST_LEVEL_THRESHOLDS: ArtistLevelThresholds = {
  developingMinPopularity: 25,
  establishedPopularity: 45,
  strongEstablishedPopularity: 60,
  developingMinFollowers: 5000,
  establishedFollowers: 50000,
  strongEstablishedFollowers: 100000
};

export async function collectArtistProfile(rawInput: ArtistInput): Promise<ArtistProfile> {
  const input = ArtistInputSchema.parse(rawInput);
  const socialLinks = extractSocialLinks(input);
  debugLog("profile", "normalized profile inputs", {
    artistName: input.artist,
    city: input.city,
    genre: input.genre,
    spotifyUrlPresent: Boolean(socialLinks.spotifyUrl),
    youtubeUrlPresent: Boolean(socialLinks.youtubeUrl),
    instagramUrlPresent: Boolean(socialLinks.instagramUrl)
  });
  const spotifyProfile = await getSpotifyArtistProfile(socialLinks.spotifyUrl);
  const youtubeStats = await getYouTubeChannelStats(socialLinks.youtubeUrl);
  const platformStats = mergePlatformStats(input.platformStats ?? {}, spotifyProfile, youtubeStats);
  const spotifyGenres = spotifyProfile?.genres ?? [];
  const genres = mergeGenres([input.genre], spotifyGenres);
  const estimatedLevel = estimateArtistLevel(platformStats);
  const confidence = calculateConfidence(socialLinks, platformStats, estimatedLevel);
  const notes = buildNotes(socialLinks, platformStats, estimatedLevel, spotifyProfile);
  debugLog("profile", "artist enrichment results", {
    spotifyEnrichmentSucceeded: Boolean(spotifyProfile),
    youtubeEnrichmentSucceeded: Boolean(youtubeStats),
    estimatedArtistLevel: estimatedLevel,
    confidence
  });

  return ArtistProfileSchema.parse({
    artistName: input.artist,
    city: input.city,
    country: null,
    genres,
    spotifyArtistName: spotifyProfile?.name ?? null,
    spotifyGenres,
    youtubeChannelId: youtubeStats?.youtubeChannelId ?? null,
    youtubeTitle: youtubeStats?.youtubeTitle ?? null,
    socialLinks,
    platformStats,
    estimatedLevel,
    confidence,
    notes
  });
}

export function extractSocialLinks(input: Pick<ArtistInput, "links" | "spotifyUrl" | "youtubeUrl" | "instagramUrl">): SocialLinks {
  const fromLinks = input.links.reduce<SocialLinks>((acc, link) => {
    const platform = detectPlatform(link);
    if (platform === "spotify" && !acc.spotifyUrl) {
      acc.spotifyUrl = link;
    }
    if (platform === "youtube" && !acc.youtubeUrl) {
      acc.youtubeUrl = link;
    }
    if (platform === "instagram" && !acc.instagramUrl) {
      acc.instagramUrl = link;
    }
    return acc;
  }, {});

  return {
    spotifyUrl: input.spotifyUrl ?? fromLinks.spotifyUrl ?? null,
    youtubeUrl: input.youtubeUrl ?? fromLinks.youtubeUrl ?? null,
    instagramUrl: input.instagramUrl ?? fromLinks.instagramUrl ?? null
  };
}

function detectPlatform(url: string): "spotify" | "youtube" | "instagram" | null {
  const hostname = new URL(url).hostname.replace(/^www\./, "");

  if (hostname === "open.spotify.com" || hostname.endsWith(".spotify.com")) {
    return "spotify";
  }

  if (hostname === "youtube.com" || hostname === "youtu.be" || hostname.endsWith(".youtube.com")) {
    return "youtube";
  }

  if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) {
    return "instagram";
  }

  return null;
}

export function estimateArtistLevel(
  stats: PlatformStats,
  thresholds: ArtistLevelThresholds = DEFAULT_ARTIST_LEVEL_THRESHOLDS
): EstimatedArtistLevel {
  const spotifyFollowers = stats.spotifyFollowers ?? null;
  const spotifyPopularity = stats.spotifyPopularity ?? null;
  const youtubeSubscribers = stats.youtubeSubscribers ?? 0;
  const youtubeTotalViews = stats.youtubeTotalViews ?? 0;
  const youtubeVideoCount = stats.youtubeVideoCount ?? 0;
  const instagramFollowers = stats.instagramFollowers ?? 0;
  const hasSpotifyMetrics = spotifyFollowers !== null || spotifyPopularity !== null;
  const hasOtherMetrics = youtubeSubscribers > 0 || youtubeTotalViews > 0 || youtubeVideoCount > 0 || instagramFollowers > 0;

  if (!hasSpotifyMetrics && !hasOtherMetrics) {
    return "unknown";
  }

  const popularity = spotifyPopularity ?? 0;
  const followers = spotifyFollowers ?? 0;
  const hasStrongEstablishedSignal =
    popularity >= thresholds.strongEstablishedPopularity || followers >= thresholds.strongEstablishedFollowers;
  const hasSupportedEstablishedSignal =
    popularity > thresholds.establishedPopularity && followers > thresholds.establishedFollowers;

  if (
    hasStrongEstablishedSignal ||
    hasSupportedEstablishedSignal ||
    (youtubeSubscribers >= 100000 && youtubeTotalViews >= 5_000_000) ||
    instagramFollowers >= 50000
  ) {
    return "established";
  }

  if (
    followers >= thresholds.developingMinFollowers ||
    popularity >= thresholds.developingMinPopularity ||
    youtubeSubscribers >= 5000 ||
    youtubeTotalViews >= 500_000 ||
    (youtubeVideoCount >= 50 && youtubeTotalViews >= 250_000) ||
    instagramFollowers >= 5000
  ) {
    return "developing";
  }

  if (
    followers > 0 ||
    popularity > 0 ||
    youtubeSubscribers > 0 ||
    youtubeTotalViews > 0 ||
    youtubeVideoCount > 0 ||
    instagramFollowers > 0
  ) {
    return "emerging";
  }

  return "unknown";
}

function mergePlatformStats(
  stats: PlatformStats,
  spotifyProfile: SpotifyArtistProfile | null,
  youtubeStats: YouTubeChannelStats | null
): PlatformStats {
  return {
    ...stats,
    spotifyFollowers: spotifyProfile?.followers ?? stats.spotifyFollowers,
    spotifyPopularity: spotifyProfile?.popularity ?? stats.spotifyPopularity,
    youtubeSubscribers: youtubeStats?.youtubeSubscribers ?? stats.youtubeSubscribers,
    youtubeTotalViews: youtubeStats?.youtubeTotalViews ?? stats.youtubeTotalViews,
    youtubeVideoCount: youtubeStats?.youtubeVideoCount ?? stats.youtubeVideoCount
  };
}

function mergeGenres(userGenres: string[], spotifyGenres: string[]): string[] {
  const seen = new Set<string>();
  return [...userGenres, ...spotifyGenres].filter((genre) => {
    const normalized = genre.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function calculateConfidence(
  socialLinks: SocialLinks,
  stats: PlatformStats,
  estimatedLevel: EstimatedArtistLevel
): number {
  const linkCount = [socialLinks.spotifyUrl, socialLinks.youtubeUrl, socialLinks.instagramUrl].filter(Boolean).length;
  const statCount = Object.values(stats).filter((value) => typeof value === "number").length;

  if (estimatedLevel === "unknown") {
    return linkCount > 0 ? 0.35 : 0.2;
  }

  return Math.min(1, 0.45 + linkCount * 0.1 + statCount * 0.1);
}

function buildNotes(
  socialLinks: SocialLinks,
  stats: PlatformStats,
  estimatedLevel: EstimatedArtistLevel,
  spotifyProfile: SpotifyArtistProfile | null
): string[] {
  const notes: string[] = [];

  if (spotifyProfile) {
    notes.push("Spotify artist metadata was fetched and merged into the profile.");
  } else {
    notes.push("Profile created without Spotify metadata; credentials or Spotify URL may be missing.");
  }

  if (Object.values(socialLinks).some(Boolean)) {
    notes.push("Social URLs were normalized from dedicated flags and the generic links field.");
  }

  if (Object.values(stats).some((value) => typeof value === "number")) {
    notes.push(`Estimated level is ${estimatedLevel} based on provided platform stats.`);
  } else {
    notes.push("Estimated level is unknown because no platform stats were provided.");
  }

  return notes;
}
