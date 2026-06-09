import { buildOpportunityPrompt } from "./prompts.js";
import { ArtistInputSchema, OpportunitySearchResultSchema, type ArtistInput, type Opportunity } from "./schemas.js";
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
import type { ArtistProfile, EventCandidate, VenueCandidate } from "./schemas.js";
import type { SimilarArtist } from "./schemas.js";
import { debugLog } from "./utils/logger.js";
import type { SimilarArtistSeedRecord } from "./modules/similarArtistSeeds.js";
import type { LastFmSimilarArtist } from "./services/lastfmService.js";
import type { MusicBrainzArtistMetadata } from "./services/musicBrainzService.js";
import { searchBookingOpportunities, type SearchBookingOpportunitiesOptions } from "./booking/searchBookingOpportunities.js";
import type { BookingOpportunity, BookingSearchResult } from "./booking/types.js";

export interface RunOpportunitySearchOptions {
  generator?: OpportunityGenerator;
  spotifyRelatedArtists?: (spotifyArtistId: string) => Promise<SpotifyArtistProfile[]>;
  spotifySearch?: (query: string, limit: number) => Promise<SpotifyArtistProfile[]>;
  spotifyArtistById?: (spotifyArtistId: string) => Promise<SpotifyArtistProfile | null>;
  lastfmSimilarArtists?: (artistName: string, limit: number) => Promise<LastFmSimilarArtist[]>;
  musicBrainzSearch?: (artistName: string) => Promise<MusicBrainzArtistMetadata | null>;
  seedCandidates?: SimilarArtistSeedRecord[];
  bookingSearchOptions?: SearchBookingOpportunitiesOptions;
}

export interface OpportunitySearchRunResult {
  artistProfile: ArtistProfile;
  similarArtists: SimilarArtistsByTier;
  venueCandidates: VenueCandidate[];
  eventCandidates: EventCandidate[];
  opportunities: Opportunity[];
  bookingSearch?: BookingSearchResult;
}

export async function runOpportunitySearch(
  rawInput: ArtistInput,
  options: RunOpportunitySearchOptions = {}
): Promise<OpportunitySearchRunResult> {
  const input = ArtistInputSchema.parse(rawInput);
  debugLog("pipeline", "runOpportunitySearch start", {
    mode: input.mode,
    artistName: input.artist,
    target: input.target ?? null
  });
  const profile = await collectArtistProfile(input);
  const similarArtists = await findSimilarArtists({
    profile,
    target: input.target,
    genre: input.genre,
    city: input.city,
    links: input.links,
    spotifyRelatedArtists: options.spotifyRelatedArtists,
    spotifySearch: options.spotifySearch,
    spotifyArtistById: options.spotifyArtistById,
    lastfmSimilarArtists: options.lastfmSimilarArtists,
    musicBrainzSearch: options.musicBrainzSearch,
    seedCandidates: options.seedCandidates
  });
  const groupedSimilarArtists = groupSimilarArtistsByTier(similarArtists);
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
      similarArtists: flattenSimilarArtists(groupedSimilarArtists)
    }, options.bookingSearchOptions);
    debugLog("pipeline", "runOpportunitySearch booking provider summary", {
      providerCount: bookingSearch.sourceMetadata.length,
      targetsCount: bookingSearch.targets.length,
      opportunitiesCount: bookingSearch.opportunities.length,
      warningsCount: bookingSearch.warnings.length
    });

    return {
      artistProfile: profile,
      similarArtists: groupedSimilarArtists,
      venueCandidates,
      eventCandidates,
      opportunities: bookingSearch.opportunities.map(mapBookingOpportunityToLegacyOpportunity),
      bookingSearch
    };
  }

  const generator = options.generator ?? new OpenAIOpportunityGenerator();
  const prompt = buildOpportunityPrompt(input, profile);
  const result = await generator.generate(prompt);
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

  return {
    artistProfile: profile,
    similarArtists: groupedSimilarArtists,
    venueCandidates,
    eventCandidates,
    opportunities: validated.opportunities.slice(0, input.limit)
  };
}

function mapBookingOpportunityToLegacyOpportunity(opportunity: BookingOpportunity): Opportunity {
  return {
    name: opportunity.name,
    type: opportunity.type,
    city: opportunity.city,
    country: opportunity.country,
    source_url: opportunity.sourceUrl,
    contact: opportunity.contact,
    reason: opportunity.reason,
    score: opportunity.score,
    suggested_message: opportunity.fitSummary
  };
}

function countSimilarArtists(groups: SimilarArtistsByTier): number {
  return groups.local_peer.length + groups.regional_peer.length + groups.support_target.length + groups.reference.length + groups.to_verify.length + groups.unknown.length;
}

function flattenSimilarArtists(groups: SimilarArtistsByTier): SimilarArtist[] {
  return [
    ...groups.local_peer,
    ...groups.regional_peer,
    ...groups.support_target,
    ...groups.reference,
    ...groups.to_verify,
    ...groups.unknown
  ];
}
