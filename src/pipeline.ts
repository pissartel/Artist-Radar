import { buildOpportunityPrompt } from "./prompts.js";
import { ArtistInputSchema, OpportunitySearchResultSchema, type ArtistInput, type Opportunity, type PipelineStage } from "./schemas.js";
import { completePipelineExecution, failPipelineExecution, startPipelineExecution, updatePipelineStage } from "./pipelineExecutionState.js";
import { collectArtistProfile } from "./modules/profileCollector.js";
import {
  findSimilarArtists,
  groupSimilarArtistsByTier,
  type SimilarArtistsByTier
} from "./modules/similarArtistsFinder.js";
import { OpenAIOpportunityGenerator, type OpportunityGenerator } from "./services/openaiService.js";
import type { SpotifyArtistProfile } from "./services/spotifyService.js";
import { gatherSearchContext } from "./services/searchService.js";
import { normalizeOpportunityUrls } from "./services/urlNormalization.js";
import { findVenueEventCandidates } from "./modules/venueEventFinder.js";
import type { ArtistProfile, EventCandidate, GenericOpportunity, VenueCandidate } from "./schemas.js";
import type { SimilarArtist } from "./schemas.js";
import { debugLog, warnLog } from "./utils/logger.js";
import type { SimilarArtistSeedRecord } from "./modules/similarArtistSeeds.js";
import type { LastFmSimilarArtist } from "./services/lastfmService.js";
import type { MusicBrainzArtistMetadata } from "./services/musicBrainzService.js";
import { searchBookingOpportunities, type SearchBookingOpportunitiesOptions } from "./booking/searchBookingOpportunities.js";
import type { BookingOpportunity, BookingSearchResult } from "./booking/types.js";
import { findSimilarArtistConcerts, type SimilarArtistConcertsResult } from "./modules/similarArtistConcerts.js";
import { buildDefaultArtistConcertProviders, type ArtistConcertProvider } from "./providers/concerts/ArtistConcertProvider.js";
import { buildTicketmasterPipelineSection, type TicketmasterPipelineSection } from "./modules/ticketmasterEvidence.js";
import {
  buildDefaultLabelDiscoveryOptions,
  discoverLabelOpportunities,
  type DiscoverLabelOpportunitiesOptions
} from "./labels/discoverLabelOpportunities.js";
import type { LabelSearchInput } from "./labels/types.js";
import { ChartmetricArtistEnrichmentProvider } from "./features/artist-enrichment/chartmetric/chartmetric.service.js";
import type {
  ArtistEnrichmentInput,
  ArtistEnrichmentProvider,
  ArtistEnrichmentResult
} from "./features/artist-enrichment/chartmetric/chartmetric.types.js";
import {
  enrichSimilarArtistsWithChartmetric,
  type SimilarArtistCandidateEnrichmentProvider
} from "./modules/similarArtistCommercialEnrichment.js";
import { findSupportSlotOpportunities, type FindSupportSlotOpportunitiesResult } from "./modules/supportSlotOpportunities.js";
import { scoreArtistScale } from "./scoring/artistScaleScore.js";

export interface RunOpportunitySearchOptions {
  generator?: OpportunityGenerator;
  spotifyRelatedArtists?: (spotifyArtistId: string) => Promise<SpotifyArtistProfile[]>;
  spotifySearch?: (query: string, limit: number) => Promise<SpotifyArtistProfile[]>;
  spotifyArtistById?: (spotifyArtistId: string) => Promise<SpotifyArtistProfile | null>;
  spotifySearchByName?: (name: string) => Promise<SpotifyArtistProfile | null>;
  spotifySeveralArtistsByIds?: (spotifyArtistIds: string[]) => Promise<SpotifyArtistProfile[]>;
  lastfmSimilarArtists?: (artistName: string, limit: number) => Promise<LastFmSimilarArtist[]>;
  musicBrainzSearch?: (artistName: string) => Promise<MusicBrainzArtistMetadata | null>;
  seedCandidates?: SimilarArtistSeedRecord[];
  bookingSearchOptions?: SearchBookingOpportunitiesOptions;
  // Concert-history providers (Bandsintown, Songkick, setlist.fm) for the
  // top-N most compatible similar artists. Defaults to the env-gated
  // provider set; override for tests or to disable the feature entirely
  // (empty array).
  artistConcertProviders?: ArtistConcertProvider[];
  labelDiscoveryOptions?: DiscoverLabelOpportunitiesOptions;
  // When provided, pipeline stage progress is recorded in the in-memory
  // execution store (see pipelineExecutionState.ts) so a status endpoint can
  // report it back to the caller while this call is still running.
  executionId?: string;
  // Optional feature toggles sent explicitly by the caller for this
  // request. Currently only the Chartmetric audience-enrichment preview
  // toggle (issue #142); the server-side flag/kill switch always applies on
  // top of this and cannot be overridden by the client.
  features?: {
    chartmetricArtistEnrichment?: boolean;
  };
  // Test/DI seam for the Chartmetric provider; defaults to a real
  // ChartmetricArtistEnrichmentProvider bound to this request's toggle.
  chartmetricProvider?: ArtistEnrichmentProvider;
  // Test/DI seam for the similar-artist-candidate Chartmetric batch
  // enrichment (issue #201); defaults to a real
  // ChartmetricSimilarArtistEnrichmentService bound to the same toggle.
  chartmetricSimilarArtistProvider?: SimilarArtistCandidateEnrichmentProvider;
}

export interface OpportunitySearchRunResult {
  artistProfile: ArtistProfile;
  similarArtists: SimilarArtistsByTier;
  venueCandidates: VenueCandidate[];
  eventCandidates: EventCandidate[];
  opportunities: Opportunity[];
  // Recent past and upcoming concerts for the top-N most compatible similar
  // artists (Bandsintown/Songkick/setlist.fm). Optional: omitted rather than
  // failing the whole analysis when the enrichment step itself errors.
  similarArtistConcerts?: SimilarArtistConcertsResult[];
  supportSlotOpportunities?: FindSupportSlotOpportunitiesResult;
  bookingSearch?: BookingSearchResult;
  // Ticketmaster-derived venue/scene evidence and diagnostics (issue #189),
  // undefined when Ticketmaster is disabled/not configured or booking mode
  // wasn't used. `ticketmaster.opportunities` is a filtered view of
  // bookingSearch.opportunities, not a second scoring system.
  ticketmaster?: TicketmasterPipelineSection;
  // Label opportunities (issue #169), discovered and ranked independently of
  // the concert-oriented booking pipeline since labels aren't event-based.
  labelOpportunities?: GenericOpportunity[];
  // Chartmetric audience-enrichment result for the main artist (issue
  // #142). Always populated by runOpportunitySearch (with a "skipped"/
  // "error" status rather than an exception on any failure) so callers can
  // distinguish "unavailable" from "not attempted" — a normalized
  // ArtistEnrichmentResult, never a raw Chartmetric response.
  chartmetric?: ArtistEnrichmentResult;
}

export async function runOpportunitySearch(
  rawInput: ArtistInput,
  options: RunOpportunitySearchOptions = {}
): Promise<OpportunitySearchRunResult> {
  const { executionId } = options;
  let currentStage: PipelineStage = "VALIDATING_ARTIST";
  if (executionId) {
    startPipelineExecution(executionId);
  }
  const track = (stage: PipelineStage): void => {
    currentStage = stage;
    if (executionId) {
      updatePipelineStage(executionId, stage);
    }
  };

  try {
    const input = ArtistInputSchema.parse(rawInput);
    debugLog("pipeline", "runOpportunitySearch start", {
      mode: input.mode,
      artistName: input.artist,
      target: input.target ?? null
    });
    track("FETCHING_ARTIST_DATA");
    const profile = await collectArtistProfile(input);
    const chartmetric = await runChartmetricEnrichmentSafely(
      {
        artistName: input.artist,
        spotifyArtistId: profile.spotify?.id ?? null,
        spotifyUrl: profile.socialLinks.spotifyUrl ?? null,
        genres: profile.genres,
        city: profile.city ?? null,
        country: profile.country ?? null
      },
      options.chartmetricProvider,
      options.features?.chartmetricArtistEnrichment
    );
    track("FINDING_SIMILAR_ARTISTS");
    const similarArtists = await findSimilarArtists({
      profile,
      target: input.target,
      genre: input.genre,
      city: input.city,
      links: input.links,
      spotifyRelatedArtists: options.spotifyRelatedArtists,
      spotifySearch: options.spotifySearch,
      spotifyArtistById: options.spotifyArtistById,
      spotifySearchByName: options.spotifySearchByName,
      spotifySeveralArtistsByIds: options.spotifySeveralArtistsByIds,
      lastfmSimilarArtists: options.lastfmSimilarArtists,
      musicBrainzSearch: options.musicBrainzSearch,
      seedCandidates: options.seedCandidates
    });
    // Chartmetric enrichment (issue #201) must never change which similar
    // artists the live-search pipeline (concert history, booking search,
    // label discovery) uses — this exact array, in this exact order, is the
    // one and only copy those consumers see from here on. `groupedSimilarArtists`
    // below is a *separate*, additively-enriched-and-regrouped copy used only
    // for the result exposed to the frontend/commercial scoring; it must never
    // be flattened back and fed into live discovery in its place.
    const similarArtistsForLiveSearch = similarArtists;
    debugLog("chartmetric", "similar artists before enrichment", summarizeSimilarArtistOrdering(similarArtists));
    const groupedSimilarArtists = await enrichSimilarArtistsWithChartmetricSafely(
      groupSimilarArtistsByTier(similarArtists),
      profile,
      chartmetric,
      options.chartmetricSimilarArtistProvider,
      options.features?.chartmetricArtistEnrichment
    );
    debugLog(
      "chartmetric",
      "similar artists after enrichment (UI/commercial-scoring copy only — not used for live discovery)",
      summarizeSimilarArtistOrdering(flattenSimilarArtists(groupedSimilarArtists))
    );
    debugLog("chartmetric", "artists passed to live discovery (concert history, booking search, label discovery)", summarizeSimilarArtistOrdering(similarArtistsForLiveSearch));
    const similarArtistConcerts = await findSimilarArtistConcertsSafely(
      similarArtistsForLiveSearch,
      options.artistConcertProviders
    );
    const enrichedSimilarArtists = flattenSimilarArtists(groupedSimilarArtists);
    const artistScaleByName = Object.fromEntries(enrichedSimilarArtists.flatMap((artist) => {
      const metrics = artist.chartmetric?.metrics;
      if (!metrics) return [];
      return [[artist.name, scoreArtistScale({
        chartmetricArtistScore: metrics.chartmetricArtistScore,
        spotifyMonthlyListeners: metrics.spotifyMonthlyListeners,
        spotifyFollowers: metrics.spotifyFollowers,
        instagramFollowers: metrics.socialAudience?.instagramFollowers,
        tiktokFollowers: metrics.socialAudience?.tiktokFollowers,
        youtubeSubscribers: metrics.socialAudience?.youtubeSubscribers,
        playlistReachScore: metrics.playlistReachScore,
        totalCurrentPlaylists: metrics.totalCurrentPlaylists,
        listenerGrowthPercent: metrics.listenerGrowthPercent,
        followerGrowthPercent: metrics.followerGrowthPercent,
        measuredAt: metrics.measuredAt,
        matchConfidence: metrics.matchConfidence
      }).artistScaleScore] as const];
    }));
    const targetArtistScale = scoreArtistScale({
      spotifyMonthlyListeners: chartmetric.metrics?.spotifyMonthlyListeners,
      spotifyFollowers: chartmetric.metrics?.spotifyFollowers ?? profile.spotify?.followers ?? undefined,
      measuredAt: chartmetric.metrics?.measuredAt,
      matchConfidence: chartmetric.metrics?.matchConfidence
    });
    const supportSlotOpportunities = findSupportSlotOpportunities({
      targetArtist: {
        name: input.artist,
        genres: [input.genre, ...profile.genres],
        country: profile.country,
        artistScaleScore: targetArtistScale.coverage > 0 ? targetArtistScale.artistScaleScore : null
      },
      referenceCountry: input.referenceCountry,
      concertHistory: similarArtistConcerts,
      artistScaleByName
    });
    track("SEARCHING_OPPORTUNITIES");
    const { venueCandidates, eventCandidates } = await findVenueEventCandidates({
      profile,
      target: input.target,
      genre: input.genre,
      city: input.city
    });
    await gatherSearchContext(input);

    if (input.mode === "booking") {
      const bookingSearch = await searchBookingOpportunities({
        artist: input.artist,
        city: input.city,
        genre: input.genre,
        target: input.target,
        links: input.links,
        limit: input.limit,
        artistProfile: profile,
        similarArtists: similarArtistsForLiveSearch
      }, options.bookingSearchOptions);
      debugLog("pipeline", "runOpportunitySearch booking provider summary", {
        providerCount: bookingSearch.sourceMetadata.length,
        // Result count by provider (issue #201 follow-up diagnostics) —
        // targetCount is each provider's raw, pre-validation candidate count;
        // compare against the final opportunitiesCount below to see how much
        // was filtered/deduped/scored away overall.
        targetCountByProvider: bookingSearch.sourceMetadata.map((source) => ({
          provider: source.sourceProvider,
          targetCount: source.targetCount
        })),
        targetsCount: bookingSearch.targets.length,
        opportunitiesBeforeValidation: bookingSearch.targets.length,
        opportunitiesAfterValidation: bookingSearch.opportunities.length,
        opportunitiesCount: bookingSearch.opportunities.length,
        warningsCount: bookingSearch.warnings.length
      });

      const labelOpportunities = await runLabelDiscoverySafely({
        artist: input.artist,
        city: input.city,
        genre: input.genre,
        target: input.target,
        limit: input.limit,
        artistProfile: profile,
        similarArtists: similarArtistsForLiveSearch
      }, options.labelDiscoveryOptions);
      track("SCORING_RESULTS");
      track("PREPARING_OVERVIEW");

      const bookingResult: OpportunitySearchRunResult = {
        artistProfile: profile,
        similarArtists: groupedSimilarArtists,
        venueCandidates,
        eventCandidates,
        opportunities: bookingSearch.opportunities.map(mapBookingOpportunityToLegacyOpportunity),
        bookingSearch,
        similarArtistConcerts,
        supportSlotOpportunities,
        ticketmaster: buildTicketmasterEvidenceSafely(bookingSearch),
        labelOpportunities,
        chartmetric
      };
      track("COMPLETED");
      if (executionId) {
        completePipelineExecution(executionId);
      }
      return bookingResult;
    }

    const generator = options.generator ?? new OpenAIOpportunityGenerator();
    const prompt = buildOpportunityPrompt(input, profile);
    const result = await generator.generate(prompt);
    track("SCORING_RESULTS");
    const validated = OpportunitySearchResultSchema.parse(normalizeOpportunityUrls(result));
    debugLog("pipeline", "runOpportunitySearch summary", {
      mode: input.mode,
      artistName: input.artist,
      similarArtistsCount: countSimilarArtists(groupedSimilarArtists),
      similarArtistGroups: {
        localPeers: groupedSimilarArtists.local_peer.length,
        regionalPeers: groupedSimilarArtists.regional_peer.length,
        supportTargets: groupedSimilarArtists.support_target.length,
        references: groupedSimilarArtists.reference.length,
        toVerify: groupedSimilarArtists.to_verify.length,
        unknown: groupedSimilarArtists.unknown.length
      },
      venueCandidatesCount: venueCandidates.length,
      eventCandidatesCount: eventCandidates.length,
      opportunitiesCount: validated.opportunities.length
    });
    track("PREPARING_OVERVIEW");

    const promoResult: OpportunitySearchRunResult = {
      artistProfile: profile,
      similarArtists: groupedSimilarArtists,
      venueCandidates,
      eventCandidates,
      opportunities: validated.opportunities.slice(0, input.limit),
      similarArtistConcerts,
      supportSlotOpportunities,
      chartmetric
    };
    track("COMPLETED");
    if (executionId) {
      completePipelineExecution(executionId);
    }
    return promoResult;
  } catch (error) {
    if (executionId) {
      failPipelineExecution(executionId, currentStage, error);
    }
    throw error;
  }
}

// Label discovery (issue #169) is an additive enrichment of the booking
// pipeline; a failure here must never take down the core booking search.
async function runLabelDiscoverySafely(
  input: LabelSearchInput,
  options: DiscoverLabelOpportunitiesOptions | undefined
): Promise<GenericOpportunity[]> {
  try {
    const labelDiscovery = await discoverLabelOpportunities(input, options ?? buildDefaultLabelDiscoveryOptions());
    debugLog("pipeline", "runOpportunitySearch label discovery summary", {
      candidateCount: labelDiscovery.metadata.rawCandidateCount,
      keptOpportunities: labelDiscovery.metadata.keptOpportunities,
      warningsCount: labelDiscovery.warnings.length
    });
    return labelDiscovery.opportunities;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debugLog("pipeline", "runOpportunitySearch label discovery failed and was skipped", { message });
    return [];
  }
}

// Chartmetric audience enrichment (issue #142) is an additive, best-effort
// step: a disabled/unconfigured provider, an unmatched artist, a timeout or
// any other provider-side failure must never take down artist analysis.
// ChartmetricArtistEnrichmentProvider.enrichArtist() already guarantees it
// never throws; this wrapper is a second line of defense against a
// misbehaving injected test/DI provider doing the same.
async function runChartmetricEnrichmentSafely(
  input: ArtistEnrichmentInput,
  provider: ArtistEnrichmentProvider | undefined,
  requestToggleEnabled: boolean | undefined
): Promise<ArtistEnrichmentResult> {
  try {
    const activeProvider = provider ?? new ChartmetricArtistEnrichmentProvider({ requestToggleEnabled });
    return await activeProvider.enrichArtist(input);
  } catch (error) {
    debugLog("enrichment", "chartmetric enrichArtist threw unexpectedly and was skipped", {
      message: error instanceof Error ? error.message : String(error)
    });
    return { provider: "chartmetric", status: "error", reason: "unexpected_error" };
  }
}

// Similar-artist-candidate Chartmetric enrichment (issue #201) is an
// additive, best-effort reranking step: ChartmetricSimilarArtistEnrichmentService
// already guarantees enrichCandidates() never throws, but a misbehaving
// injected test/DI provider (or a bug in the reranking/regrouping logic
// itself) must still never take down the existing similar-artist discovery
// output — on any failure this degrades to the original, unenriched groups.
async function enrichSimilarArtistsWithChartmetricSafely(
  groupedSimilarArtists: SimilarArtistsByTier,
  profile: ArtistProfile,
  mainArtistChartmetric: ArtistEnrichmentResult,
  provider: SimilarArtistCandidateEnrichmentProvider | undefined,
  requestToggleEnabled: boolean | undefined
): Promise<SimilarArtistsByTier> {
  try {
    return await enrichSimilarArtistsWithChartmetric({
      profile,
      similarArtists: groupedSimilarArtists,
      mainArtistChartmetric,
      requestToggleEnabled,
      provider
    });
  } catch (error) {
    warnLog("chartmetric", "similar-artist candidate enrichment failed and was skipped", {
      message: error instanceof Error ? error.message : String(error)
    });
    return groupedSimilarArtists;
  }
}

function mapBookingOpportunityToLegacyOpportunity(opportunity: BookingOpportunity): Opportunity {
  return {
    name: opportunity.name,
    rawTitle: opportunity.rawTitle,
    displayTitle: opportunity.displayTitle,
    summary: opportunity.summary,
    type: opportunity.type,
    city: opportunity.city,
    country: opportunity.country,
    source_url: opportunity.sourceUrl,
    contact: opportunity.contact,
    reason: opportunity.reason,
    score: opportunity.score,
    suggested_message: opportunity.fitSummary,
    date: opportunity.eventDate,
    dateRange: opportunity.dateRange,
    genres: opportunity.target.genres,
    venueCapacity: opportunity.target.estimatedCapacity ?? null,
    address: opportunity.target.address ?? null,
    recentEvents: opportunity.target.pastProgramming ?? [],
    lineup: opportunity.target.lineup ?? [],
    imageUrl: opportunity.imageUrl ?? undefined,
    ticketUrl: opportunity.ticketUrl ?? undefined,
    matchBreakdown: opportunity.matchBreakdown,
    supportSlotPotential: opportunity.supportSlotPotential,
    relatedArtist: opportunity.derivedFromSimilarArtist
      ? {
          name: opportunity.derivedFromSimilarArtist.name,
          popularityComparison: opportunity.derivedFromSimilarArtist.popularityComparison,
          matchedGenres: opportunity.derivedFromSimilarArtist.matchedGenres
        }
      : null,
    internalReview: opportunity.internalReview
  };
}

function countSimilarArtists(groups: SimilarArtistsByTier): number {
  return groups.local_peer.length + groups.regional_peer.length + groups.support_target.length + groups.reference.length + groups.to_verify.length + groups.unknown.length;
}

export function flattenSimilarArtists(groups: SimilarArtistsByTier): SimilarArtist[] {
  return [
    ...groups.local_peer,
    ...groups.regional_peer,
    ...groups.support_target,
    ...groups.reference,
    ...groups.to_verify,
    ...groups.unknown
  ];
}

// Dev-only diagnostics (issue #201 follow-up: "make it possible to compare
// Chartmetric enabled versus disabled"). Lists count/order/identity, never
// the full artist payload.
function summarizeSimilarArtistOrdering(artists: SimilarArtist[]): { count: number; order: Array<{ name: string; spotifyId: string | null }> } {
  return {
    count: artists.length,
    order: artists.map((artist) => ({ name: artist.name, spotifyId: artist.spotifyId }))
  };
}

// A failure enriching similar artists with concert history must never fail
// the whole artist analysis (AGENTS.md-style resilience, matching the
// booking pipeline's own provider-isolation conventions elsewhere in this
// file): degrade to an empty result and log a warning instead of throwing.
async function findSimilarArtistConcertsSafely(
  similarArtists: SimilarArtist[],
  providers: ArtistConcertProvider[] | undefined
): Promise<SimilarArtistConcertsResult[]> {
  try {
    const resolvedProviders = providers ?? buildDefaultArtistConcertProviders();
    return await findSimilarArtistConcerts(similarArtists, resolvedProviders);
  } catch (error) {
    warnLog("concert-history", `Similar-artist concert-history enrichment failed and was skipped: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

// Ticketmaster evidence assembly is a pure, already-fetched-data operation
// (no extra API calls), but a failure here must still never fail the whole
// artist analysis — degrade to undefined with a logged warning instead.
function buildTicketmasterEvidenceSafely(bookingSearch: BookingSearchResult): TicketmasterPipelineSection | undefined {
  try {
    return buildTicketmasterPipelineSection(bookingSearch);
  } catch (error) {
    warnLog("ticketmaster", `Ticketmaster evidence assembly failed and was skipped: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}
