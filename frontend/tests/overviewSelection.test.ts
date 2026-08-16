import { describe, expect, it } from "vitest";
import {
  OVERVIEW_OPPORTUNITY_LIMIT,
  OVERVIEW_SIMILAR_ARTIST_LIMIT,
  selectOverviewMapOpportunities,
  selectOverviewSimilarArtists,
} from "@/lib/overviewSelection";
import type { Opportunity, OpportunityType, SimilarArtist } from "@/types";

function opportunity(id: string, type: OpportunityType): Opportunity {
  return {
    id,
    type,
    category: type,
    title: id,
    location: "Paris, France",
    description: "",
    tags: [],
    matchScore: 80,
    matchReasons: [],
    genres: [],
    recentEvents: [],
    lineup: [],
  };
}

describe("overview selection", () => {
  it("uses the carousel's ranked similar-artist limit", () => {
    const artists: SimilarArtist[] = Array.from({ length: 20 }, (_, index) => ({
      id: `artist-${index}`,
      name: `Artist ${index}`,
      genres: [],
      location: "Paris, France",
      matchScore: index,
    }));

    const selected = selectOverviewSimilarArtists(artists);

    expect(selected).toHaveLength(OVERVIEW_SIMILAR_ARTIST_LIMIT);
    expect(selected[0].matchScore).toBe(19);
  });

  it("caps mapped opportunities independently for each type", () => {
    const opportunities = [
      ...Array.from({ length: 14 }, (_, index) => opportunity(`venue-${index}`, "venue")),
      ...Array.from({ length: 12 }, (_, index) => opportunity(`festival-${index}`, "festival")),
    ];

    const selected = selectOverviewMapOpportunities(opportunities);

    expect(selected.filter((item) => item.type === "venue")).toHaveLength(OVERVIEW_OPPORTUNITY_LIMIT);
    expect(selected.filter((item) => item.type === "festival")).toHaveLength(OVERVIEW_OPPORTUNITY_LIMIT);
  });
});
