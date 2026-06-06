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
import type { ArtistProfile, EventCandidate, SimilarArtist, VenueCandidate } from "./schemas.js";
import { debugLog } from "./utils/logger.js";

export interface RunOpportunitySearchOptions {
  generator?: OpportunityGenerator;
  spotifyRelatedArtists?: (spotifyArtistId: string) => Promise<SpotifyArtistProfile[]>;
  spotifySearch?: (query: string, limit: number) => Promise<SpotifyArtistProfile[]>;
}

export interface OpportunitySearchRunResult {
  artistProfile: ArtistProfile;
  similarArtists: SimilarArtist[];
  similarArtistsByTier: SimilarArtistsByTier;
  venueCandidates: VenueCandidate[];
  eventCandidates: EventCandidate[];
  opportunities: Opportunity[];
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
    spotifySearch: options.spotifySearch
  });
  const similarArtistsByTier = groupSimilarArtistsByTier(similarArtists);
  const { venueCandidates, eventCandidates } = await findVenueEventCandidates({
    profile,
    target: input.target,
    genre: input.genre,
    city: input.city
  });
  await gatherSearchContext(input);

  const generator = options.generator ?? new OpenAIOpportunityGenerator();
  const prompt = buildOpportunityPrompt(input, profile);
  const result = await generator.generate(prompt);
  const validated = OpportunitySearchResultSchema.parse(normalizeOpportunityUrls(result));
  debugLog("pipeline", "runOpportunitySearch summary", {
    mode: input.mode,
    artistName: input.artist,
    similarArtistsCount: similarArtists.length,
    venueCandidatesCount: venueCandidates.length,
    eventCandidatesCount: eventCandidates.length,
    opportunitiesCount: validated.opportunities.length
  });

  return {
    artistProfile: profile,
    similarArtists,
    similarArtistsByTier,
    venueCandidates,
    eventCandidates,
    opportunities: validated.opportunities.slice(0, input.limit)
  };
}
