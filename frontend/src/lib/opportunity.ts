import type { MatchFactor, Opportunity, OpportunityCategory } from "@/types";

export type OpportunitySortOption =
  | "best_match"
  | "newest"
  | "closest_location"
  | "most_actionable";

export type { OpportunityCategory };

export type BookingTabName =
  | "All"
  | "Concerts"
  | "Venues"
  | "Festivals"
  | "Opening Slots"
  | "Contacts"
  | "Raw JSON";

export const CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  concert: "Concert",
  venue: "Venue",
  festival: "Festival",
  opening_slot: "Opening Slot",
  organization: "Organization",
  contact: "Contact",
  unknown: "Unknown",
};

// Card layout family per the by-type redesign (issue #130): concerts,
// festivals, and opening slots share the event layout (date + location
// first); venues and organizations get their own layouts.
export type OpportunityCardFamily = "event" | "venue" | "organization";

export function getCardFamily(opportunity: Opportunity): OpportunityCardFamily {
  if (opportunity.type === "venue") return "venue";
  if (opportunity.type === "organization") return "organization";
  return "event";
}

const ORGANIZATION_TYPE_LABELS: Record<string, string> = {
  association: "Association",
  collective: "Collective",
  promoter: "Promoter",
  booking_agency: "Booking Agency",
  live_producer: "Live Producer",
  springboard: "Springboard Program",
  open_call: "Open Call",
};

export function getOrganizationTypeLabel(opportunity: Opportunity): string {
  const rawType = opportunity.organizationType;
  if (!rawType) return "Organization";
  return ORGANIZATION_TYPE_LABELS[rawType] ?? "Organization";
}

export function hasBookingContact(opportunity: Opportunity): boolean {
  return Boolean(opportunity.contact);
}

export function filterBookingOpportunities(
  opportunities: Opportunity[],
  activeTab: BookingTabName,
): Opportunity[] {
  switch (activeTab) {
    case "Concerts":
      return opportunities.filter((o) => o.category === "concert");
    case "Venues":
      return opportunities.filter((o) => o.category === "venue");
    case "Festivals":
      return opportunities.filter((o) => o.category === "festival");
    case "Opening Slots":
      return opportunities.filter((o) => o.category === "opening_slot");
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

// Raw source URL, kept separate from getOpportunitySource (which only
// returns the hostname for display) so the source attribution can render as
// an actual clickable link rather than plain text (issue #130 review feedback).
export function getOpportunitySourceUrl(opportunity: Opportunity): string | null {
  return opportunity.sourceUrls?.[0] ?? null;
}

export interface OpportunityContactAction {
  href: string;
  label: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+]?[\d\s().-]{6,}$/;

// Only returns an action when the contact string is itself directly usable
// (an email, URL, or phone number) — never fabricates a link from free text.
export function getContactAction(opportunity: Opportunity): OpportunityContactAction | null {
  const contact = opportunity.contact?.trim();
  if (!contact) return null;
  if (EMAIL_PATTERN.test(contact)) return { href: `mailto:${contact}`, label: "Contact" };
  if (/^https?:\/\//i.test(contact)) return { href: contact, label: "Contact" };
  if (PHONE_PATTERN.test(contact)) return { href: `tel:${contact.replace(/[^\d+]/g, "")}`, label: "Contact" };
  return null;
}

// Only returns an action when a ticket/booking URL was already found on the
// source page — never fabricated (issue #130 review feedback).
export function getTicketAction(opportunity: Opportunity): OpportunityContactAction | null {
  const ticketUrl = opportunity.ticketUrl?.trim();
  if (!ticketUrl) return null;
  return { href: ticketUrl, label: "Get tickets" };
}

export type OpportunityStatus = "verified" | "needs_review";

export function getOpportunityTitle(opportunity: Opportunity): string {
  return opportunity.title || "Untitled opportunity";
}

const MAX_DISPLAY_TITLE_LENGTH = 80;

// Strips a trailing " - <source name>" / " | <source name>" segment that
// merely repeats the source hostname (e.g. "... - France TV" when the
// source is france.tv), then truncates overly long scraped titles.
export function getDisplayTitle(opportunity: Opportunity): string {
  const rawTitle = getOpportunityTitle(opportunity);
  const source = getOpportunitySource(opportunity);
  const withoutSourceSuffix = stripTrailingSourceLabel(rawTitle, source);
  return truncateTitle(withoutSourceSuffix);
}

function stripTrailingSourceLabel(title: string, source: string | null): string {
  if (!source) return title;
  const segments = title.split(/\s+[-|]\s+/);
  if (segments.length <= 1) return title;

  const lastSegment = segments[segments.length - 1].toLowerCase();
  const sourceNamePart = source.split(".")[0].toLowerCase();
  const looksLikeSource =
    lastSegment.length > 0 &&
    (lastSegment.includes(sourceNamePart) || sourceNamePart.includes(lastSegment));

  return looksLikeSource ? segments.slice(0, -1).join(" - ").trim() : title;
}

function truncateTitle(title: string, maxLength = MAX_DISPLAY_TITLE_LENGTH): string {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, maxLength - 1).trimEnd()}…`;
}

// Prefer the structured match breakdown over the legacy `matchReasons` prose
// (issue #130 review feedback: the card must never surface raw scoring text).
export function getPositiveMatchFactors(opportunity: Opportunity): MatchFactor[] {
  return opportunity.matchBreakdown?.positiveFactors ?? [];
}

export function getNegativeMatchFactors(opportunity: Opportunity): MatchFactor[] {
  return opportunity.matchBreakdown?.negativeFactors ?? [];
}

// Missing/unverified information (e.g. "capacity unknown"), distinct from
// getNegativeMatchFactors so the UI never presents unknown information as a
// confirmed risk (issue #130 review feedback).
export function getNeutralMatchFactors(opportunity: Opportunity): MatchFactor[] {
  return opportunity.matchBreakdown?.neutralFactors ?? [];
}

export function getShortRelevanceReason(opportunity: Opportunity): string | null {
  const [topPositive] = getPositiveMatchFactors(opportunity);
  if (topPositive) return topPositive.label;
  const [topNegative] = getNegativeMatchFactors(opportunity);
  if (topNegative) return topNegative.label;
  const [reason] = opportunity.matchReasons;
  return reason || null;
}

export function getMissingFields(opportunity: Opportunity): string[] {
  const missing: string[] = [];
  if (!hasBookingContact(opportunity)) missing.push("No contact found");
  if (!opportunity.date) missing.push("Date unclear");
  return missing;
}

export function getOpportunityStatus(opportunity: Opportunity): OpportunityStatus {
  return getMissingFields(opportunity).length > 0 ? "needs_review" : "verified";
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
