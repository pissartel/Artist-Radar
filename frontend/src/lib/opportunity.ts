import type { Opportunity } from "@/types";

export type OpportunitySortOption =
  | "best_match"
  | "newest"
  | "closest_location"
  | "most_actionable";

export function formatOpportunityDate(date?: string): string | null {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getOpportunitySource(opportunity: Opportunity): string | null {
  const url = opportunity.sourceUrls?.[0];
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function locationRank(opportunity: Opportunity, artistCity?: string, artistCountry?: string): number {
  if (artistCity && opportunity.city === artistCity) return 0;
  if (artistCountry && opportunity.country === artistCountry) return 1;
  return 2;
}

function actionabilityScore(opportunity: Opportunity): number {
  return (opportunity.contact ? 2 : 0) + (opportunity.date ? 1 : 0);
}

export function sortOpportunities(
  opportunities: Opportunity[],
  sortBy: OpportunitySortOption,
  artistCity?: string,
  artistCountry?: string,
): Opportunity[] {
  const sorted = [...opportunities];

  switch (sortBy) {
    case "newest":
      return sorted.sort((a, b) => {
        if (!a.date && !b.date) return b.matchScore - a.matchScore;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
    case "closest_location":
      return sorted.sort((a, b) => {
        const rankDiff =
          locationRank(a, artistCity, artistCountry) - locationRank(b, artistCity, artistCountry);
        return rankDiff !== 0 ? rankDiff : b.matchScore - a.matchScore;
      });
    case "most_actionable":
      return sorted.sort((a, b) => {
        const scoreDiff = actionabilityScore(b) - actionabilityScore(a);
        return scoreDiff !== 0 ? scoreDiff : b.matchScore - a.matchScore;
      });
    case "best_match":
    default:
      return sorted.sort((a, b) => b.matchScore - a.matchScore);
  }
}
