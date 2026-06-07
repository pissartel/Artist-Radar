import type { ArtistTier, EstimatedArtistLevel, SizeSignalSource } from "../schemas.js";

export interface SizeSignals {
  spotifyFollowers?: number | null;
  spotifyArtistPopularity?: number | null;
  spotifyTopTrackPopularityMax?: number | null;
  spotifyTopTrackPopularityAvg?: number | null;
  youtubeSubscribers?: number | null;
  youtubeTotalViews?: number | null;
  youtubeVideoCount?: number | null;
  manualEstimatedTier?: ArtistTier | null;
}

export interface ArtistSizeEstimate {
  estimatedLevel: EstimatedArtistLevel;
  sizeTier: ArtistTier;
  sizeConfidence: number;
  sizeSignalSource: SizeSignalSource;
  sizeReasons: string[];
}

type RankedSignal = {
  source: SizeSignalSource;
  tier: ArtistTier;
  confidence: number;
  reason: string;
};

const TIER_RANK: Record<ArtistTier, number> = {
  unknown: 0,
  small: 1,
  medium: 2,
  large: 3
};

export function estimateArtistSize(signals: SizeSignals): ArtistSizeEstimate {
  const rankedSignals = collectSignals(signals);
  if (rankedSignals.length === 0) {
    return {
      estimatedLevel: "unknown",
      sizeTier: "unknown",
      sizeConfidence: 0,
      sizeSignalSource: "unknown",
      sizeReasons: ["No reliable audience metrics available from configured providers."]
    };
  }

  const chosenTier = chooseFinalTier(rankedSignals);
  const source = buildSource(rankedSignals);
  const confidence = buildConfidence(rankedSignals, chosenTier);
  const reasons = buildReasons(rankedSignals, chosenTier, source);

  return {
    estimatedLevel: tierToLevel(chosenTier),
    sizeTier: chosenTier,
    sizeConfidence: confidence,
    sizeSignalSource: source,
    sizeReasons: reasons.length > 0 ? reasons : ["Estimated from available platform signals."]
  };
}

function chooseFinalTier(signals: RankedSignal[]): ArtistTier {
  const youtubeTier = chooseFamilyTier(signals.filter((signal) => signal.source === "youtube"));
  const spotifyTier = chooseFamilyTier(
    signals.filter((signal) => signal.source === "spotify_artist" || signal.source === "spotify_tracks")
  );
  const manualTier = chooseFamilyTier(signals.filter((signal) => signal.source === "manual"));

  if (youtubeTier !== "unknown") {
    let finalTier: ArtistTier = youtubeTier;
    if (spotifyTier !== "unknown") {
      finalTier = chooseLowerTier(finalTier, spotifyTier);
    }
    if (manualTier !== "unknown") {
      finalTier = chooseLowerTier(finalTier, manualTier);
    }
    return finalTier;
  }

  if (spotifyTier !== "unknown") {
    let finalTier: ArtistTier = spotifyTier;
    if (manualTier !== "unknown") {
      finalTier = chooseLowerTier(finalTier, manualTier);
    }
    return finalTier;
  }

  if (manualTier !== "unknown") {
    return manualTier;
  }

  const tiers = signals.map((signal) => signal.tier).filter((tier) => tier !== "unknown");
  if (tiers.length === 0) {
    return "unknown";
  }

  return tiers.slice(1).reduce<ArtistTier>((safeTier, tier) => chooseLowerTier(safeTier, tier), tiers[0] ?? "unknown");
}

function collectSignals(signals: SizeSignals): RankedSignal[] {
  const rankedSignals: RankedSignal[] = [];

  const spotifyArtistTier = determineSpotifyArtistTier(signals.spotifyFollowers ?? null, signals.spotifyArtistPopularity ?? null);
  if (spotifyArtistTier !== "unknown") {
    rankedSignals.push({
      source: "spotify_artist",
      tier: spotifyArtistTier,
      confidence: spotifyArtistTier === "large" ? 0.9 : spotifyArtistTier === "medium" ? 0.75 : 0.7,
      reason: describeSpotifyArtistSignals(signals.spotifyFollowers ?? null, signals.spotifyArtistPopularity ?? null)
    });
  }

  const spotifyTrackTier = determineSpotifyTrackTier(
    signals.spotifyTopTrackPopularityMax ?? null,
    signals.spotifyTopTrackPopularityAvg ?? null
  );
  if (spotifyTrackTier !== "unknown") {
    rankedSignals.push({
      source: "spotify_tracks",
      tier: spotifyTrackTier,
      confidence: spotifyTrackTier === "large" ? 0.8 : spotifyTrackTier === "medium" ? 0.65 : 0.6,
      reason: describeSpotifyTrackSignals(signals.spotifyTopTrackPopularityMax ?? null, signals.spotifyTopTrackPopularityAvg ?? null)
    });
  }

  const youtubeTier = determineYouTubeTier(signals.youtubeSubscribers ?? null, signals.youtubeTotalViews ?? null);
  if (youtubeTier !== "unknown") {
    rankedSignals.push({
      source: "youtube",
      tier: youtubeTier,
      confidence: youtubeTier === "large" ? 0.78 : youtubeTier === "medium" ? 0.64 : 0.58,
      reason: describeYouTubeSignals(
        signals.youtubeSubscribers ?? null,
        signals.youtubeTotalViews ?? null,
        signals.youtubeVideoCount ?? null
      )
    });
  }

  if (signals.manualEstimatedTier && signals.manualEstimatedTier !== "unknown") {
    rankedSignals.push({
      source: "manual",
      tier: signals.manualEstimatedTier,
      confidence: signals.manualEstimatedTier === "large" ? 0.62 : signals.manualEstimatedTier === "medium" ? 0.56 : 0.5,
      reason: `Manual estimate suggests ${signals.manualEstimatedTier}.`
    });
  }

  return rankedSignals;
}

function buildSource(signals: RankedSignal[]): SizeSignalSource {
  if (signals.length === 0) {
    return "unknown";
  }

  const distinctSources = new Set(signals.map((signal) => signal.source));
  if (distinctSources.size === 1) {
    return signals[0]?.source ?? "unknown";
  }

  return "mixed";
}

function buildConfidence(signals: RankedSignal[], chosenTier: ArtistTier): number {
  const contributing = signals.filter((signal) => signal.tier !== "unknown");
  if (contributing.length === 0) {
    return 0;
  }

  const agreeing = contributing.filter((signal) => signal.tier === chosenTier);
  const averageConfidence = contributing.reduce((sum, signal) => sum + signal.confidence, 0) / contributing.length;
  const agreementBoost = agreeing.length / contributing.length;
  const conflictPenalty = contributing.length > agreeing.length ? 0.15 : 0;

  return clamp(Number((averageConfidence * 0.7 + agreementBoost * 0.3 - conflictPenalty).toFixed(2)));
}

function buildReasons(signals: RankedSignal[], chosenTier: ArtistTier, source: SizeSignalSource): string[] {
  const reasons = signals.map((signal) => signal.reason);
  if (signals.length > 1) {
    reasons.unshift(`Mixed size signals resolved to ${chosenTier} from ${source}.`);
  } else if (signals.length === 1) {
    reasons.unshift(`Size estimated from ${source}.`);
  }
  return [...new Set(reasons)];
}

function determineSpotifyArtistTier(followers: number | null, popularity: number | null): ArtistTier {
  if (followers === null && popularity === null) {
    return "unknown";
  }

  const followerTier = determineSpotifyAudienceTier(followers, 5000, 50000);
  const popularityTier = determineSpotifyPopularityTier(popularity, 25, 45);
  return chooseStrongerTier(followerTier, popularityTier);
}

function determineSpotifyTrackTier(maxPopularity: number | null, avgPopularity: number | null): ArtistTier {
  if (maxPopularity === null && avgPopularity === null) {
    return "unknown";
  }

  const maxTier =
    typeof maxPopularity === "number"
      ? maxPopularity > 55
        ? "large"
        : maxPopularity >= 30
          ? "medium"
          : "small"
      : "unknown";
  const avgTier =
    typeof avgPopularity === "number"
      ? avgPopularity > 45
        ? "large"
        : avgPopularity >= 25
          ? "medium"
          : "small"
      : "unknown";
  return chooseStrongerTier(maxTier, avgTier);
}

function determineYouTubeTier(subscribers: number | null, totalViews: number | null): ArtistTier {
  if (subscribers === null && totalViews === null) {
    return "unknown";
  }

  const subscriberTier =
    typeof subscribers === "number"
      ? subscribers > 20000
        ? "large"
        : subscribers >= 1000
          ? "medium"
          : "small"
      : "unknown";
  const viewsTier =
    typeof totalViews === "number"
      ? totalViews > 2_000_000
        ? "large"
        : totalViews >= 100_000
          ? "medium"
          : "small"
      : "unknown";
  return chooseStrongerTier(subscriberTier, viewsTier);
}

function determineSpotifyAudienceTier(
  value: number | null,
  mediumMin: number,
  largeMin: number
): ArtistTier {
  if (value === null) {
    return "unknown";
  }
  if (value > largeMin) {
    return "large";
  }
  if (value >= mediumMin) {
    return "medium";
  }
  return "small";
}

function determineSpotifyPopularityTier(value: number | null, mediumMin: number, largeMin: number): ArtistTier {
  if (value === null) {
    return "unknown";
  }
  if (value > largeMin) {
    return "large";
  }
  if (value >= mediumMin) {
    return "medium";
  }
  return "small";
}

function chooseStrongerTier(left: ArtistTier, right: ArtistTier): ArtistTier {
  if (left === "unknown") {
    return right;
  }
  if (right === "unknown") {
    return left;
  }
  return TIER_RANK[left] >= TIER_RANK[right] ? left : right;
}

function chooseLowerTier(left: ArtistTier, right: ArtistTier): ArtistTier {
  if (left === "unknown") {
    return right;
  }
  if (right === "unknown") {
    return left;
  }
  return TIER_RANK[left] <= TIER_RANK[right] ? left : right;
}

function chooseFamilyTier(signals: RankedSignal[]): ArtistTier {
  if (signals.length === 0) {
    return "unknown";
  }

  return signals.reduce<ArtistTier>((strongest, signal) => chooseStrongerTier(strongest, signal.tier), "unknown");
}

function tierToLevel(tier: ArtistTier): EstimatedArtistLevel {
  if (tier === "small") {
    return "emerging";
  }
  if (tier === "medium") {
    return "developing";
  }
  if (tier === "large") {
    return "established";
  }
  return "unknown";
}

function describeSpotifyArtistSignals(followers: number | null, popularity: number | null): string {
  const parts: string[] = [];
  if (typeof followers === "number") {
    parts.push(`Spotify followers=${followers}`);
  }
  if (typeof popularity === "number") {
    parts.push(`Spotify popularity=${popularity}`);
  }
  return parts.length > 0 ? `${parts.join(", ")}.` : "Spotify artist metrics were unavailable.";
}

function describeSpotifyTrackSignals(maxPopularity: number | null, avgPopularity: number | null): string {
  const parts: string[] = [];
  if (typeof maxPopularity === "number") {
    parts.push(`top-track max=${maxPopularity}`);
  }
  if (typeof avgPopularity === "number") {
    parts.push(`top-track avg=${avgPopularity}`);
  }
  return parts.length > 0 ? `${parts.join(", ")}.` : "Spotify top-track metrics were unavailable.";
}

function describeYouTubeSignals(
  subscribers: number | null,
  totalViews: number | null,
  videoCount: number | null
): string {
  const parts: string[] = [];
  if (typeof subscribers === "number") {
    parts.push(`YouTube subscribers=${subscribers}`);
  }
  if (typeof totalViews === "number") {
    parts.push(`YouTube views=${totalViews}`);
  }
  if (typeof videoCount === "number") {
    parts.push(`YouTube videos=${videoCount}`);
  }
  return parts.length > 0 ? `${parts.join(", ")}.` : "YouTube metrics were unavailable.";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
