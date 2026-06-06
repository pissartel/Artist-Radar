import { buildOpportunityPrompt } from "./prompts.js";
import { ArtistInputSchema, OpportunitySearchResultSchema, type ArtistInput, type Opportunity } from "./schemas.js";
import { collectArtistProfile } from "./modules/profileCollector.js";
import {
  findSimilarArtists,
  groupSimilarArtistsByTier,
  type SimilarArtistsByTier
} from "./modules/similarArtistsFinder.js";
import { OpenAIOpportunityGenerator, type OpportunityGenerator } from "./services/openaiService.js";
import { gatherSearchContext } from "./services/searchService.js";
import { normalizeOpportunityUrls } from "./services/urlNormalization.js";
import type { ArtistProfile, SimilarArtist } from "./schemas.js";

export interface RunOpportunitySearchOptions {
  generator?: OpportunityGenerator;
}

export interface OpportunitySearchRunResult {
  artistProfile: ArtistProfile;
  similarArtists: SimilarArtist[];
  similarArtistsByTier: SimilarArtistsByTier;
  opportunities: Opportunity[];
}

export async function runOpportunitySearch(
  rawInput: ArtistInput,
  options: RunOpportunitySearchOptions = {}
): Promise<OpportunitySearchRunResult> {
  const input = ArtistInputSchema.parse(rawInput);
  const profile = await collectArtistProfile(input);
  const similarArtists = findSimilarArtists({
    profile,
    target: input.target,
    genre: input.genre,
    city: input.city,
    links: input.links
  });
  const similarArtistsByTier = groupSimilarArtistsByTier(similarArtists);
  await gatherSearchContext(input);

  const generator = options.generator ?? new OpenAIOpportunityGenerator();
  const prompt = buildOpportunityPrompt(input, profile);
  const result = await generator.generate(prompt);
  const validated = OpportunitySearchResultSchema.parse(normalizeOpportunityUrls(result));

  return {
    artistProfile: profile,
    similarArtists,
    similarArtistsByTier,
    opportunities: validated.opportunities.slice(0, input.limit)
  };
}
