import type {
  ContactPurpose,
  LineupEntry,
  MatchFactor,
  Opportunity,
  OpportunityCategory,
  OpportunityContact,
} from "@/types";

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
  label: "Label",
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
  if (opportunity.sourceProvider) return opportunity.sourceProvider;
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
// Shared by opportunity and venue pages (issue #213), both of which surface
// the same underlying contact value.
export function getContactActionForValue(rawContact?: string | null): OpportunityContactAction | null {
  const contact = rawContact?.trim();
  if (!contact) return null;
  if (EMAIL_PATTERN.test(contact)) return { href: `mailto:${contact}`, label: "Contact" };
  if (/^https?:\/\//i.test(contact)) return { href: contact, label: "Contact" };
  if (PHONE_PATTERN.test(contact)) return { href: `tel:${contact.replace(/[^\d+]/g, "")}`, label: "Contact" };
  return null;
}

export function getContactAction(opportunity: Opportunity): OpportunityContactAction | null {
  return getContactActionForValue(opportunity.contact);
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

// Opportunity types that represent a single scheduled event with its own
// date/venue, as opposed to an organization (venue, label, booker, ...).
const LIVE_EVENT_TYPES = new Set(["concert", "festival", "opening_slot"]);

export function isLiveEventOpportunity(opportunity: Opportunity): boolean {
  return LIVE_EVENT_TYPES.has(opportunity.type);
}

// True when there is enough live-event-specific data to justify the
// prominent event info block; avoids rendering a near-empty callout.
export function hasLiveEventInfo(opportunity: Opportunity): boolean {
  return (
    isLiveEventOpportunity(opportunity) &&
    Boolean(
      opportunity.date ||
        opportunity.time ||
        opportunity.venue ||
        opportunity.address ||
        opportunity.city ||
        opportunity.headliner?.length,
    )
  );
}

export function getRecommendedAction(opportunity: Opportunity): string | null {
  const action = opportunity.recommendedAction ?? opportunity.description;
  return action && action.trim().length > 0 ? action : null;
}

export const CONTACT_PURPOSE_LABELS: Record<ContactPurpose, string> = {
  booking: "Booking",
  management: "Management",
  press: "Press",
  submissions: "Submissions",
  partnerships: "Partnerships",
  general: "General",
};

const CONTACT_PURPOSE_ORDER: ContactPurpose[] = [
  "booking",
  "management",
  "press",
  "submissions",
  "partnerships",
  "general",
];

export interface ContactGroup {
  purpose: ContactPurpose;
  label: string;
  contacts: OpportunityContact[];
}

// Groups contacts by purpose so the detail panel never shows an
// undifferentiated contact list. Falls back to the legacy single `contact`
// string as an unclassified "General" entry when no structured contacts
// were provided, rather than guessing its purpose.
export function getGroupedContacts(opportunity: Opportunity): ContactGroup[] {
  const contacts =
    opportunity.contacts && opportunity.contacts.length > 0
      ? opportunity.contacts
      : opportunity.contact
        ? [{ purpose: "general" as const, label: "Contact", value: opportunity.contact }]
        : [];

  const byPurpose = new Map<ContactPurpose, OpportunityContact[]>();
  for (const contact of contacts) {
    const group = byPurpose.get(contact.purpose) ?? [];
    group.push(contact);
    byPurpose.set(contact.purpose, group);
  }

  return CONTACT_PURPOSE_ORDER.filter((purpose) => byPurpose.has(purpose)).map((purpose) => ({
    purpose,
    label: CONTACT_PURPOSE_LABELS[purpose],
    contacts: byPurpose.get(purpose)!,
  }));
}

export interface MetadataItem {
  label: string;
  value: string;
}

// Low-priority leftover facts (tags, custom metadata) shown last, only when
// present, so they never create an empty "Additional metadata" section.
export function getAdditionalMetadata(opportunity: Opportunity): MetadataItem[] {
  const items: MetadataItem[] = [];
  if (opportunity.tags.length > 0) {
    items.push({ label: "Tags", value: opportunity.tags.join(", ") });
  }
  if (opportunity.metadata) {
    items.push(...opportunity.metadata);
  }
  return items;
}

export const LINEUP_POSITION_LABELS: Record<NonNullable<LineupEntry["position"]>, string> = {
  headliner: "Headliner",
  support: "Support",
  opener: "Opener",
  other: "Other",
};

// Prefers the structured `lineupEntries` from the backend. Falls back to the
// flat `headliner`/`lineup` strings, marking only the names we can actually
// confirm as headliners — the rest are listed without a position rather than
// guessing "support" or "opener" (issue #132 review feedback).
export function getLineupEntries(opportunity: Opportunity): LineupEntry[] {
  if (opportunity.lineupEntries && opportunity.lineupEntries.length > 0) {
    return opportunity.lineupEntries;
  }

  const headliners = opportunity.headliner ?? [];
  const headlinerNames = new Set(headliners.map((name) => name.trim().toLowerCase()));
  const entries: LineupEntry[] = headliners.map((name) => ({ name, position: "headliner" }));

  for (const name of opportunity.lineup) {
    if (headlinerNames.has(name.trim().toLowerCase())) continue;
    entries.push({ name });
  }

  return entries;
}

// Honest, count-based lineup-completeness wording (issue #213) — never
// claims a lineup is "complete" or "final", since the source data never
// confirms that; only describes what is actually known.
export function getLineupCompletenessLabel(opportunity: Opportunity): string | null {
  const entries = getLineupEntries(opportunity);
  if (entries.length === 0) return null;

  const hasHeadliner = entries.some((entry) => entry.position === "headliner");
  if (entries.length === 1 && hasHeadliner) {
    return "Headliner confirmed — rest of the lineup not yet announced";
  }

  return `${entries.length} artist${entries.length === 1 ? "" : "s"} listed`;
}

const VENUE_TYPE_LABELS: Record<string, string> = {
  bar: "Bar",
  association: "Association",
  festival: "Festival",
  cultural_centre: "Cultural Centre",
};

export function getVenueTypeLabel(opportunity: Opportunity): string | null {
  if (!opportunity.venueType) return null;
  if (opportunity.venueType === "venue") return null;
  return VENUE_TYPE_LABELS[opportunity.venueType] ?? opportunity.venueType;
}

export interface SourceEvidenceItem {
  url: string;
  title: string | null;
  website: string | null;
  retrievedInfo: string | null;
}

// Prefers the richer `sourceEvidence` from the backend; falls back to the
// flat `sourceUrls` (hostname + link only) so every source is still listed,
// not only the first one (issue #132 review feedback).
export function getSourceEvidence(opportunity: Opportunity): SourceEvidenceItem[] {
  if (opportunity.sourceEvidence && opportunity.sourceEvidence.length > 0) {
    return opportunity.sourceEvidence.map((item) => ({
      url: item.url,
      title: item.title ?? null,
      website: getUrlHostname(item.url),
      retrievedInfo: item.retrievedInfo ?? null,
    }));
  }

  return (opportunity.sourceUrls ?? []).map((url) => ({
    url,
    title: null,
    website: getUrlHostname(url),
    retrievedInfo: null,
  }));
}

function normalizeUrlForComparison(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

// Two URLs pointing at the same resource (ignoring hash/trailing slash/case)
// — used to hide a source link that's already shown elsewhere on the page
// under a different label (e.g. a venue's "Website" row and the event's
// "Source and ticketing" link resolving to the same URL, PR #218 review
// feedback: "no identical source shown twice").
export function isSameUrl(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return normalizeUrlForComparison(a) === normalizeUrlForComparison(b);
}

// Source evidence with anything already shown elsewhere on the page (e.g.
// the event/ticket link in "Source and ticketing") filtered out, so the
// same source is never displayed twice (PR #218 review feedback: "Source
// and ticketing" and "Source evidence" must never repeat the same URL).
export function getSourceEvidenceExcluding(
  opportunity: Opportunity,
  excludeUrls: (string | null | undefined)[],
): SourceEvidenceItem[] {
  const excluded = new Set(
    excludeUrls.filter((url): url is string => Boolean(url)).map(normalizeUrlForComparison),
  );
  return getSourceEvidence(opportunity).filter((item) => !excluded.has(normalizeUrlForComparison(item.url)));
}

export type OpportunitySignalKind =
  | "support_slot_available"
  | "open_call"
  | "venue_contact"
  | "general_event";

export interface OpportunitySignalInfo {
  kind: OpportunitySignalKind;
  label: string;
  description: string;
}

// Tells the artist, at a glance, what kind of opportunity this is — derived
// only from fields/factors we already have, never guessed (issue #132 review
// feedback: "make it immediately clear whether this is an announced show
// with a support slot, an open call, a venue to contact, or a general event").
export function getOpportunitySignal(opportunity: Opportunity): OpportunitySignalInfo {
  if (opportunity.organizationType === "open_call") {
    return {
      kind: "open_call",
      label: "Open call",
      description: "This organizer is accepting submissions or applications.",
    };
  }

  if (opportunity.type === "venue") {
    return {
      kind: "venue_contact",
      label: "Venue to contact",
      description: "No confirmed event yet — this venue can be contacted about future booking opportunities.",
    };
  }

  const allFactors = [
    ...(opportunity.matchBreakdown?.positiveFactors ?? []),
    ...(opportunity.matchBreakdown?.neutralFactors ?? []),
  ];
  const hasSupportSlotSignal = allFactors.some((factor) => factor.code === "support_slot_signal");

  if (isLiveEventOpportunity(opportunity) && hasSupportSlotSignal) {
    return {
      kind: "support_slot_available",
      label: "Announced show — possible support slot",
      description: "A public support-slot signal was found for this show.",
    };
  }

  return {
    kind: "general_event",
    label: "General event",
    description: "No confirmed opportunity signal was found yet for this listing.",
  };
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
