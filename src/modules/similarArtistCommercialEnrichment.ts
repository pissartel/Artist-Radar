// Issue #201: post-processes the already-discovered/ranked similar-artist
// list (src/modules/similarArtistsFinder.ts) with Chartmetric audience data
// and a commercial-scale tier/score — purely additive, so a failure here
// must never change or drop a candidate from the existing discovery output.
// The caller (pipeline.ts) wraps this in its own try/catch for that reason;
// this module still degrades gracefully on its own (see enrichCandidates()'s
// guarantees in chartmetric.similarArtistEnrichment.ts) so most failures
// never reach that outer catch at all.
import {
  ChartmetricSimilarArtistEnrichmentService,
  type SimilarArtistCandidateInput
} from "../features/artist-enrichment/chartmetric/chartmetric.similarArtistEnrichment.js";
import type {
  ArtistEnrichmentResult,
  ChartmetricCandidateMetrics,
  SimilarArtistCandidateEnrichmentResult
} from "../features/artist-enrichment/chartmetric/chartmetric.types.js";
import {
  DEFAULT_COMMERCIAL_TIER_THRESHOLDS,
  scoreSimilarArtistCommercialCompatibility,
  type SimilarArtistCommercialTierThresholds
} from "../scoring/similarArtistCommercialScore.js";
import { groupSimilarArtistsByTier, type SimilarArtistsByTier } from "./similarArtistsFinder.js";
import type { ArtistProfile, BookingCategory, SimilarArtist } from "../schemas.js";
import { debugLog } from "../utils/logger.js";

export interface SimilarArtistCandidateEnrichmentProvider {
  enrichCandidates(input: {
    mainArtistChartmetricId?: string | null;
    candidates: SimilarArtistCandidateInput[];
  }): Promise<SimilarArtistCandidateEnrichmentResult[]>;
}

export interface EnrichSimilarArtistsWithChartmetricInput {
  profile: ArtistProfile;
  similarArtists: SimilarArtistsByTier;
  // Main-artist result from issue #142's phase-1 provider, when available —
  // reused as the audience-size/identity reference point rather than
  // re-resolving the main artist's own Chartmetric identity a second time.
  mainArtistChartmetric?: ArtistEnrichmentResult;
  requestToggleEnabled?: boolean;
  provider?: SimilarArtistCandidateEnrichmentProvider;
  tierThresholds?: SimilarArtistCommercialTierThresholds;
}

export async function enrichSimilarArtistsWithChartmetric(
  input: EnrichSimilarArtistsWithChartmetricInput
): Promise<SimilarArtistsByTier> {
  const flattened = flattenGroups(input.similarArtists);
  if (flattened.length === 0) {
    return input.similarArtists;
  }

  const provider = input.provider ?? new ChartmetricSimilarArtistEnrichmentService({ requestToggleEnabled: input.requestToggleEnabled });
  const mainArtistChartmetricId = input.mainArtistChartmetric?.metrics?.chartmetricArtistId ?? null;

  const candidateInputs: SimilarArtistCandidateInput[] = flattened.map((artist) => ({
    artistName: artist.name,
    spotifyArtistId: artist.spotifyId ?? artist.spotify?.id ?? null,
    spotifyUrl: artist.spotifyUrl ?? artist.spotify?.url ?? null,
    genres: artist.genres,
    city: artist.city,
    country: artist.country,
    priority: artist.totalRelevance,
    source: artist.source,
    bookingCategory: artist.bookingCategory,
    genreRelevance: artist.genreRelevance,
    sceneRelevance: artist.sceneRelevance,
    artistTier: artist.artistTier,
    estimatedFollowers: artist.estimatedFollowers
  }));

  const enrichmentResults = await provider.enrichCandidates({
    mainArtistChartmetricId,
    candidates: candidateInputs
  });
  const resultByName = new Map(enrichmentResults.map((result) => [result.candidateName, result]));

  debugLog("chartmetric", "similar-artist candidate enrichment summary", {
    candidateCount: flattened.length,
    enrichedCount: enrichmentResults.filter((result) => result.status === "success" || result.status === "partial").length
  });

  const thresholds = input.tierThresholds ?? DEFAULT_COMMERCIAL_TIER_THRESHOLDS;
  const mainArtistAudience = {
    chartmetricSpotifyMonthlyListeners: input.mainArtistChartmetric?.metrics?.spotifyMonthlyListeners ?? null,
    chartmetricSpotifyFollowers: input.mainArtistChartmetric?.metrics?.spotifyFollowers ?? null,
    spotifyFollowers: input.profile.spotify?.followers ?? null,
    estimatedLevel: input.profile.estimatedLevel
  };

  const enriched = flattened.map((artist): SimilarArtist => {
    const chartmetricResult = resultByName.get(artist.name);
    const chartmetricMetrics = chartmetricResult?.metrics;
    const chartmetricFollowers = chartmetricMetrics?.spotifyFollowers;
    const chartmetricMonthlyListeners = chartmetricMetrics?.spotifyMonthlyListeners;
    const estimatedFollowers = chartmetricFollowers ?? artist.estimatedFollowers;
    const artistTier = resolveArtistTier(artist.artistTier, chartmetricFollowers ?? chartmetricMonthlyListeners, chartmetricMetrics?.chartmetricArtistScore);
    const popularity = mergeChartmetricPopularity(artist, artistTier, chartmetricFollowers);
    const scoreResult = scoreSimilarArtistCommercialCompatibility({
      mainArtist: mainArtistAudience,
      candidate: {
        genreRelevance: artist.genreRelevance,
        sceneRelevance: artist.sceneRelevance,
        artistTier,
        estimatedFollowers,
        evidenceSignalCount: countEvidenceSignals(artist)
      },
      chartmetricMetrics,
      thresholds
    });
    const relevance = adjustRelevanceWithChartmetricAudience(artist, artistTier, chartmetricMetrics, scoreResult.score);
    const evidenceNotes = relevance.addedEvidenceNote
      ? [...artist.evidenceNotes, relevance.addedEvidenceNote]
      : artist.evidenceNotes;

    return {
      ...artist,
      artistTier,
      estimatedFollowers,
      popularity,
      sizeRelevance: relevance.sizeRelevance,
      bookingCategory: relevance.bookingCategory,
      totalRelevance: relevance.totalRelevance,
      relevanceToUserArtist: relevance.totalRelevance,
      possibleUse: relevance.possibleUse,
      evidenceNotes,
      ...(chartmetricResult
        ? {
            chartmetric: {
              status: chartmetricResult.status,
              ...(chartmetricResult.reason ? { reason: chartmetricResult.reason } : {}),
              ...(chartmetricResult.matchMethod ? { matchMethod: chartmetricResult.matchMethod } : {}),
              ...(chartmetricResult.matchConfidence ? { matchConfidence: chartmetricResult.matchConfidence } : {}),
              ...(chartmetricResult.metrics ? { metrics: chartmetricResult.metrics } : {})
            }
          }
        : {}),
      commercialTier: scoreResult.tier,
      commercialAbsoluteScale: scoreResult.absoluteScale,
      commercialScore: scoreResult.score,
      commercialScoreCoverage: scoreResult.coverage,
      commercialScoreConfidence: scoreResult.confidence,
      commercialScoreBreakdown: scoreResult.components,
      commercialScoreExplanation: scoreResult.explanation,
      chartmetricDiagnostics: buildDiagnostics(artist, chartmetricResult, scoreResult)
    };
  });

  return sortGroups(groupSimilarArtistsByTier(enriched));
}

function resolveArtistTier(
  existingTier: SimilarArtist["artistTier"],
  chartmetricAudience: number | undefined,
  chartmetricArtistScore: number | undefined
): SimilarArtist["artistTier"] {
  if (chartmetricArtistScore !== undefined) {
    if (chartmetricArtistScore >= 20) {
      return "large";
    }
    if (chartmetricArtistScore >= 10 && existingTier === "unknown") {
      return "medium";
    }
  }
  if (existingTier !== "unknown" || chartmetricAudience === undefined) {
    return existingTier;
  }
  if (chartmetricAudience > 50_000) {
    return "large";
  }
  if (chartmetricAudience >= 5_000) {
    return "medium";
  }
  return "small";
}

function mergeChartmetricPopularity(
  artist: SimilarArtist,
  artistTier: SimilarArtist["artistTier"],
  chartmetricFollowers: number | undefined
): SimilarArtist["popularity"] {
  if (chartmetricFollowers === undefined) {
    return artist.popularity;
  }

  const existingPlatforms = artist.popularity.platforms ?? {};
  const existingSpotify = existingPlatforms.spotify;
  const platforms = {
    ...existingPlatforms,
    spotify: {
      followers: chartmetricFollowers,
      popularity: existingSpotify?.popularity ?? null,
      sourceUrl: existingSpotify?.sourceUrl ?? artist.spotifyUrl ?? null
    }
  };
  const platformCount = Object.keys(platforms).length;

  return {
    estimatedLevel: artist.popularity.estimatedLevel === "unknown" ? artistTier : artist.popularity.estimatedLevel,
    confidence: Math.max(artist.popularity.confidence, platformCount > 1 ? 0.75 : 0.58),
    sizeSignalSource: artist.popularity.sizeSignalSource === "unknown" ? "spotify" : artist.popularity.sizeSignalSource,
    platforms
  };
}

function adjustRelevanceWithChartmetricAudience(
  artist: SimilarArtist,
  artistTier: SimilarArtist["artistTier"],
  chartmetricMetrics: ChartmetricCandidateMetrics | undefined,
  commercialScore: number | null
): {
  sizeRelevance: number;
  bookingCategory: BookingCategory;
  totalRelevance: number;
  possibleUse: SimilarArtist["possibleUse"];
  addedEvidenceNote?: string;
} {
  if (!hasReliableChartmetricAudience(chartmetricMetrics) || artist.bookingCategory !== "to_verify" || artist.genreRelevance < 55) {
    return {
      sizeRelevance: artist.sizeRelevance,
      bookingCategory: artist.bookingCategory,
      totalRelevance: artist.totalRelevance,
      possibleUse: artist.possibleUse
    };
  }

  if (artistTier === "large" || (chartmetricMetrics.chartmetricArtistScore ?? 0) >= 20) {
    return {
      sizeRelevance: 35,
      bookingCategory: "reference",
      totalRelevance: Math.min(62, artist.totalRelevance),
      possibleUse: "long_term_reference",
      addedEvidenceNote: "Chartmetric artist score indicates a larger-scale reference artist; not treated as a peer booking target."
    };
  }

  const chartmetricAudience = chartmetricMetrics.spotifyMonthlyListeners ?? chartmetricMetrics.spotifyFollowers ?? 0;
  const sizeFloor = artistTier === "medium" ? 70 : 65;
  const sizeRelevance = Math.max(artist.sizeRelevance, sizeFloor);
  const commercialBonus = commercialScore === null ? 0 : Math.min(6, Math.max(0, Math.round((commercialScore - 50) / 8)));
  const artistScoreBonus = chartmetricMetrics.chartmetricArtistScore
    ? chartmetricMetrics.chartmetricArtistScore >= 20
      ? 4
      : chartmetricMetrics.chartmetricArtistScore >= 10
        ? 2
        : 0
    : 0;
  const audienceBonus = chartmetricAudience >= 5_000 ? 3 : chartmetricAudience >= 1_000 ? 2 : 1;
  const recalculated = Math.round(
    artist.genreRelevance * 0.45 +
      sizeRelevance * 0.25 +
      artist.sceneRelevance * 0.15 +
      Math.max(artist.localRelevance, 45) * 0.05 +
      10 +
      commercialBonus +
      artistScoreBonus +
      audienceBonus
  );
  const totalRelevance = Math.max(artist.totalRelevance, Math.min(72, recalculated));

  return {
    sizeRelevance,
    bookingCategory: artist.bookingCategory,
    totalRelevance,
    possibleUse: artist.possibleUse === "unknown" ? "booking_research" : artist.possibleUse,
    addedEvidenceNote:
      "chartmetric audience verified a small/medium-scale candidate; kept as to_verify because genre/location evidence is still incomplete."
  };
}

function hasReliableChartmetricAudience(metrics: ChartmetricCandidateMetrics | undefined): metrics is ChartmetricCandidateMetrics {
  if (!metrics || !["exact", "high"].includes(metrics.matchConfidence)) {
    return false;
  }
  return metrics.spotifyMonthlyListeners !== undefined || metrics.spotifyFollowers !== undefined;
}

function buildDiagnostics(
  artist: SimilarArtist,
  chartmetricResult: SimilarArtistCandidateEnrichmentResult | undefined,
  scoreResult: ReturnType<typeof scoreSimilarArtistCommercialCompatibility>
): SimilarArtist["chartmetricDiagnostics"] {
  const notSelected = chartmetricResult?.reason === "not_selected_for_enrichment";
  const lookupAttempted = Boolean(chartmetricResult) && chartmetricResult!.status !== "skipped" && chartmetricResult!.status !== "budget_limited";

  return {
    selectedForEnrichment: !notSelected,
    spotifyIdPresent: Boolean(artist.spotifyId ?? artist.spotify?.id),
    spotifyUrlPresent: Boolean(artist.spotifyUrl ?? artist.spotify?.url),
    lookupAttempted,
    ...(chartmetricResult?.status ? { status: chartmetricResult.status } : {}),
    ...(chartmetricResult?.reason ? { skipReason: chartmetricResult.reason } : {}),
    ...(chartmetricResult?.matchMethod ? { matchMethod: chartmetricResult.matchMethod } : {}),
    ...(chartmetricResult?.matchConfidence ? { matchConfidence: chartmetricResult.matchConfidence } : {}),
    metricsReturned: Boolean(chartmetricResult?.metrics),
    ...(chartmetricResult?.cacheHit !== undefined ? { cacheHit: chartmetricResult.cacheHit } : {}),
    finalAudienceRatio: scoreResult.audienceRatio,
    finalCommercialTier: scoreResult.tier,
    scoreCoverage: scoreResult.coverage,
    scoreConfidence: scoreResult.confidence
  };
}

function countEvidenceSignals(artist: SimilarArtist): number {
  const platformCount = Object.keys(artist.popularity?.platforms ?? {}).length;
  const sourceCount = artist.sources.length > 0 ? artist.sources.length : 1;
  return sourceCount + platformCount;
}

const TIER_ORDER: BookingCategory[] = ["local_peer", "regional_peer", "support_target", "to_verify", "reference", "unknown"];

function flattenGroups(groups: SimilarArtistsByTier): SimilarArtist[] {
  return TIER_ORDER.flatMap((tier) => groups[tier]);
}

function sortGroups(groups: SimilarArtistsByTier): SimilarArtistsByTier {
  return {
    local_peer: sortArtists(groups.local_peer),
    regional_peer: sortArtists(groups.regional_peer),
    support_target: sortArtists(groups.support_target),
    to_verify: sortArtists(groups.to_verify),
    reference: sortArtists(groups.reference),
    unknown: sortArtists(groups.unknown)
  };
}

function sortArtists(artists: SimilarArtist[]): SimilarArtist[] {
  return [...artists].sort((left, right) => {
    if (left.totalRelevance !== right.totalRelevance) {
      return right.totalRelevance - left.totalRelevance;
    }
    const leftChartmetricScore = left.chartmetric?.metrics?.chartmetricArtistScore ?? -1;
    const rightChartmetricScore = right.chartmetric?.metrics?.chartmetricArtistScore ?? -1;
    if (leftChartmetricScore !== rightChartmetricScore) {
      return rightChartmetricScore - leftChartmetricScore;
    }
    const leftAudience = left.chartmetric?.metrics?.spotifyMonthlyListeners ?? left.chartmetric?.metrics?.spotifyFollowers ?? -1;
    const rightAudience = right.chartmetric?.metrics?.spotifyMonthlyListeners ?? right.chartmetric?.metrics?.spotifyFollowers ?? -1;
    if (leftAudience !== rightAudience) {
      return rightAudience - leftAudience;
    }
    return left.name.localeCompare(right.name);
  });
}
