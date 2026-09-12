import { industryFreshnessScore } from "./freshness.js";
import { normalizeIndustryName } from "./normalization.js";
import type { IndustryOrganization, IndustrySearchContext } from "./types.js";

export interface IndustryScoreWeights {
  genreFit: number; similarArtistOverlap: number; rosterSimilarity: number; geographyFit: number;
  careerStageFit: number; freshness: number; sourceConfidence: number;
}
export const DEFAULT_INDUSTRY_SCORE_WEIGHTS: IndustryScoreWeights = {
  genreFit: .2, similarArtistOverlap: .3, rosterSimilarity: .2, geographyFit: .1,
  careerStageFit: .1, freshness: .05, sourceConfidence: .05
};

export interface IndustryMatch { organization: IndustryOrganization; score: number; reasons: string[]; matchingArtists: Array<{ name: string; similarityScore: number | null }>; }

export function scoreIndustryOrganization(org: IndustryOrganization, context: IndustrySearchContext, weights = DEFAULT_INDUSTRY_SCORE_WEIGHTS): IndustryMatch {
  const wantedGenres = new Set(context.normalizedGenres);
  const orgGenres = org.genres.map(normalizeIndustryName);
  const genreFit = orgGenres.length ? orgGenres.filter((g) => wantedGenres.has(g)).length / Math.max(1, wantedGenres.size) : 0;
  const similarByName = new Map(context.similarArtists.map((artist) => [normalizeIndustryName(artist.name), artist]));
  const matching = org.artistRelations.flatMap((relation) => {
    const artist = similarByName.get(normalizeIndustryName(relation.artistName));
    if (!artist || relation.active === false) return [];
    return [{ name: artist.name, similarityScore: Math.max(0, Math.min(1, artist.totalRelevance / 100)) }];
  });
  const uniqueMatching = [...new Map(matching.map((m) => [normalizeIndustryName(m.name), m])).values()];
  const strongest = Math.max(0, ...uniqueMatching.map((m) => m.similarityScore));
  const overlap = Math.min(1, uniqueMatching.length / 3);
  const geography = !context.country || !org.country ? .5 : normalizeIndustryName(context.country) === normalizeIndustryName(org.country) ? 1 : .2;
  const sourceConfidence = Math.max(org.confidenceScore, ...org.sources.map((source) => source.confidence));
  const components = { genreFit, similarArtistOverlap: strongest, rosterSimilarity: overlap, geographyFit: geography, careerStageFit: .5, freshness: industryFreshnessScore(org.lastVerifiedAt), sourceConfidence };
  const score = Math.round(100 * Object.entries(weights).reduce((sum, [key, weight]) => sum + components[key as keyof typeof components] * weight, 0));
  const reasons: string[] = [];
  if (uniqueMatching.length) reasons.push(`Works with ${uniqueMatching.length} artist${uniqueMatching.length > 1 ? "s" : ""} similar to you: ${uniqueMatching.map((m) => m.name).join(", ")}.`);
  if (genreFit > 0) reasons.push("Its documented roster genres overlap with your artist profile.");
  if (geography === 1) reasons.push(`Active in ${context.country}.`);
  if (org.contacts.length || org.submissionUrl) reasons.push("A public contact or submission route is available.");
  return { organization: org, score, reasons: reasons.length ? reasons : ["Potential industry fit; supporting evidence is limited."], matchingArtists: uniqueMatching };
}
