import type { Opportunity, OpportunityType, SimilarArtist } from "@/types";
import { sortSimilarArtistsByMatch } from "@/lib/similarArtist";

export const OVERVIEW_SIMILAR_ARTIST_LIMIT = 15;
export const OVERVIEW_OPPORTUNITY_LIMIT = 10;

export function selectOverviewSimilarArtists(artists: SimilarArtist[]): SimilarArtist[] {
  return sortSimilarArtistsByMatch(artists).slice(0, OVERVIEW_SIMILAR_ARTIST_LIMIT);
}

export function selectOverviewMapOpportunities(opportunities: Opportunity[]): Opportunity[] {
  const counts = new Map<OpportunityType, number>();

  return opportunities.filter((opportunity) => {
    const count = counts.get(opportunity.type) ?? 0;
    if (count >= OVERVIEW_OPPORTUNITY_LIMIT) return false;
    counts.set(opportunity.type, count + 1);
    return true;
  });
}
