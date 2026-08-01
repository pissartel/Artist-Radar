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
    priority: artist.totalRelevance
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
    const scoreResult = scoreSimilarArtistCommercialCompatibility({
      mainArtist: mainArtistAudience,
      candidate: {
        genreRelevance: artist.genreRelevance,
        sceneRelevance: artist.sceneRelevance,
        artistTier: artist.artistTier,
        estimatedFollowers: artist.estimatedFollowers,
        evidenceSignalCount: countEvidenceSignals(artist)
      },
      chartmetricMetrics: chartmetricResult?.metrics,
      thresholds
    });

    return {
      ...artist,
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
      commercialScore: scoreResult.score,
      commercialScoreBreakdown: scoreResult.components,
      commercialScoreExplanation: scoreResult.explanation
    };
  });

  return groupSimilarArtistsByTier(enriched);
}

function countEvidenceSignals(artist: SimilarArtist): number {
  const platformCount = Object.keys(artist.popularity?.platforms ?? {}).length;
  const sourceCount = artist.sources.length > 0 ? artist.sources.length : 1;
  return sourceCount + platformCount;
}

const TIER_ORDER: BookingCategory[] = ["local_peer", "regional_peer", "support_target", "reference", "to_verify", "unknown"];

function flattenGroups(groups: SimilarArtistsByTier): SimilarArtist[] {
  return TIER_ORDER.flatMap((tier) => groups[tier]);
}
