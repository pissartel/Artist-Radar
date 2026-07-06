import type { Opportunity, OpportunityType } from "@/types";

export type OpportunitySortOption =
  | "best_match"
  | "newest"
  | "closest_location"
  | "most_actionable";

export type OpportunityCategory =
  | "concert"
  | "venue"
  | "festival"
  | "opening_slot"
  | "contact"
  | "unknown";

export type BookingTabName =
  | "All"
  | "Concerts"
  | "Venues"
  | "Festivals"
  | "Opening Slots"
  | "Contacts"
  | "Raw JSON";

const CATEGORY_BY_TYPE: Record<OpportunityType, OpportunityCategory> = {
  concert: "concert",
  venue: "venue",
  festival: "festival",
  opening_slot: "opening_slot",
};

const SUPPORT_SLOT_SIGNALS = ["support slot", "support-slot", "opening act", "first part"];

function hasSupportSlotSignal(opportunity: Opportunity): boolean {
  return opportunity.tags.some((tag) =>
    SUPPORT_SLOT_SIGNALS.some((signal) => tag.toLowerCase().includes(signal)),
  );
}

export function hasBookingContact(opportunity: Opportunity): boolean {
  return Boolean(opportunity.contact);
}

export function getOpportunityCategory(opportunity: Opportunity): OpportunityCategory {
  if (CATEGORY_BY_TYPE[opportunity.type]) {
    return CATEGORY_BY_TYPE[opportunity.type];
  }
  if (hasSupportSlotSignal(opportunity)) return "opening_slot";
  if (hasBookingContact(opportunity)) return "contact";
  return "unknown";
}

export function filterBookingOpportunities(
  opportunities: Opportunity[],
  activeTab: BookingTabName,
): Opportunity[] {
  switch (activeTab) {
    case "Concerts":
      return opportunities.filter((o) => getOpportunityCategory(o) === "concert");
    case "Venues":
      return opportunities.filter((o) => getOpportunityCategory(o) === "venue");
    case "Festivals":
      return opportunities.filter((o) => getOpportunityCategory(o) === "festival");
    case "Opening Slots":
      return opportunities.filter(
        (o) => getOpportunityCategory(o) === "opening_slot" || hasSupportSlotSignal(o),
      );
    case "Contacts":
      return opportunities.filter(hasBookingContact);
    case "All":
    case "Raw JSON":
    default:
      return opportunities;
  }
}

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

export function getUrlHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function getOpportunitySource(opportunity: Opportunity): string | null {
  const url = opportunity.sourceUrls?.[0];
  if (!url) return null;
  return getUrlHostname(url);
}

export function getOpportunityById(
  opportunities: Opportunity[],
  id: string,
): Opportunity | undefined {
  return opportunities.find((opportunity) => opportunity.id === id);
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
