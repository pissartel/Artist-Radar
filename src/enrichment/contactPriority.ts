import {
  HEADLINER_AGENCY_SEARCH_MARKER,
  type ContactPriorityRole,
  type EnrichedContact,
  type EnrichmentConfidenceLevel,
  type RankedContact,
  type VerifiableField
} from "./types.js";

const PRIORITY_ORDER: ContactPriorityRole[] = [
  "organizer_promoter",
  "venue_booking",
  "contact_form",
  "organizer_social",
  "headliner_agency",
  "generic_venue",
  "ticketing"
];

export interface RankContactsInput {
  contacts: EnrichedContact[];
  socialProfiles: VerifiableField<string>[];
  ticketUrl: VerifiableField<string>;
  /** Announced artists (headliner first); a social/contact tied to one of these is a headliner agency/tour contact, not a generic one. */
  headliners: string[];
  /** The opportunity's own source page URL: a booking contact found there is the organizer/promoter, not a separately-discovered venue contact. */
  primarySourceUrl: string | null;
}

export interface RankContactsResult {
  primaryContact: RankedContact | null;
  secondaryActions: RankedContact[];
  confidenceLevel: EnrichmentConfidenceLevel;
}

/**
 * Ranks actionable contacts per the priority order from issue #159:
 * organizer/promoter, then venue booking contact, then a bare contact form,
 * then the organizer's own social profile, then the headline artist's
 * booking agency/tour contact, then any other generic venue contact.
 * Ticketing links are appended last and can never become the primary
 * contact, even if they're the only verified signal found.
 */
export function rankContacts(input: RankContactsInput): RankContactsResult {
  const ranked: RankedContact[] = [];

  for (const contact of input.contacts) {
    ranked.push(classifyContact(contact, input));
  }

  for (const social of input.socialProfiles) {
    if (!social.value || ranked.some((entry) => entry.value === social.value)) {
      continue;
    }
    ranked.push({
      role: mentionsHeadliner(social.value, "", input.headliners) ? "headliner_agency" : "organizer_social",
      type: "social",
      value: social.value,
      sourceUrl: social.sourceUrl,
      verified: social.verified
    });
  }

  ranked.sort((left, right) => PRIORITY_ORDER.indexOf(left.role) - PRIORITY_ORDER.indexOf(right.role));

  const primaryIndex = ranked.findIndex((entry) => entry.verified);
  const primaryContact = primaryIndex >= 0 ? ranked[primaryIndex] : null;
  const secondaryActions = ranked.filter((_, index) => index !== primaryIndex);

  if (input.ticketUrl.value && !secondaryActions.some((entry) => entry.value === input.ticketUrl.value)) {
    secondaryActions.push({
      role: "ticketing",
      type: "unknown",
      value: input.ticketUrl.value,
      sourceUrl: input.ticketUrl.sourceUrl,
      verified: input.ticketUrl.verified
    });
  }

  return {
    primaryContact,
    secondaryActions,
    confidenceLevel: computeConfidenceLevel(primaryContact, ranked)
  };
}

function classifyContact(contact: EnrichedContact, input: RankContactsInput): RankedContact {
  const base = { type: contact.type, value: contact.value, sourceUrl: contact.sourceUrl, verified: contact.verified };

  if (contact.type === "contact_form") {
    return { ...base, role: "contact_form" };
  }

  if (contact.notes?.includes(HEADLINER_AGENCY_SEARCH_MARKER) || mentionsHeadliner(contact.value, contact.notes ?? "", input.headliners)) {
    return { ...base, role: "headliner_agency" };
  }

  if (contact.type === "social") {
    const role: ContactPriorityRole = contact.sourceUrl === input.primarySourceUrl ? "organizer_social" : "generic_venue";
    return { ...base, role };
  }

  if (contact.role === "BOOKING") {
    const role: ContactPriorityRole = contact.sourceUrl === input.primarySourceUrl ? "organizer_promoter" : "venue_booking";
    return { ...base, role };
  }

  if (contact.role === "MANAGEMENT") {
    return { ...base, role: "headliner_agency" };
  }

  return { ...base, role: "generic_venue" };
}

function mentionsHeadliner(value: string, notes: string, headliners: string[]): boolean {
  if (headliners.length === 0) {
    return false;
  }
  const haystack = `${value} ${notes}`.toLowerCase();
  return headliners.some((name) => name.trim().length > 0 && haystack.includes(name.trim().toLowerCase()));
}

function computeConfidenceLevel(primaryContact: RankedContact | null, ranked: RankedContact[]): EnrichmentConfidenceLevel {
  if (primaryContact) {
    return "verified";
  }
  if (ranked.some((entry) => entry.role !== "generic_venue")) {
    return "likely";
  }
  return "unverified";
}
