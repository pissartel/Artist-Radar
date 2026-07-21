import type { BookingSourceType, ContactCandidate, ContactCandidateType } from "../booking/types.js";

export type ContactRole =
  | "BOOKING"
  | "GENERAL"
  | "MANAGEMENT"
  | "PRESS"
  | "SUBMISSIONS"
  | "PARTNERSHIPS"
  | "UNKNOWN";

/**
 * Actionable-contact priority tiers from issue #159: organizer/promoter
 * outranks a venue's generic booking contact, which outranks a bare contact
 * form, then the organizer's own social profile, then the headline artist's
 * booking agency/tour contact, then any other generic venue contact.
 * Ticketing is a distinct tier: always a supporting action, never a
 * substitute for an actionable contact.
 */
export type ContactPriorityRole =
  | "organizer_promoter"
  | "venue_booking"
  | "contact_form"
  | "organizer_social"
  | "headliner_agency"
  | "generic_venue"
  | "ticketing";

export type EnrichmentConfidenceLevel = "verified" | "likely" | "unverified";

export interface RankedContact {
  role: ContactPriorityRole;
  type: ContactCandidateType;
  value: string;
  sourceUrl: string | null;
  verified: boolean;
}

/** Notes marker tagging a contact found via the dedicated headliner
 * booking-agency/tour-manager search, so ranking can classify it correctly
 * even when its role (e.g. BOOKING) would otherwise look like a venue contact. */
export const HEADLINER_AGENCY_SEARCH_MARKER = "Found via headliner booking-agency search.";

/**
 * Minimal shape an opportunity must satisfy to be enriched. A `BookingTarget`
 * or `BookingOpportunity.target` already satisfies this structurally.
 */
export interface EnrichableOpportunity {
  name: string;
  sourceUrl: string | null;
  sourceType: BookingSourceType;
  contacts: ContactCandidate[];
  eventDate?: string | null;
  venueName?: string | null;
  city?: string | null;
  /** Announced artists (headliner first), used to target the booking-agency/tour-contact search. */
  headliners?: string[];
}

export interface EnrichedContact {
  type: ContactCandidateType;
  value: string;
  role: ContactRole;
  sourceUrl: string | null;
  verified: boolean;
  notes: string | null;
}

/**
 * A single enriched fact paired with whether it was reconfirmed against a
 * freshly fetched source during this enrichment run. `verified: false` does
 * not mean the value is wrong — only that it could not be reconfirmed now
 * (e.g. the page could not be fetched), so the UI must not treat it as
 * equivalent to a freshly verified fact.
 */
export interface VerifiableField<T> {
  value: T | null;
  verified: boolean;
  sourceUrl: string | null;
}

export interface OpportunityEnrichment {
  opportunityName: string;
  officialWebsite: VerifiableField<string>;
  sourcePage: VerifiableField<string>;
  contacts: EnrichedContact[];
  socialProfiles: VerifiableField<string>[];
  bookingInstructions: VerifiableField<string>;
  organizerName: VerifiableField<string>;
  promoterName: VerifiableField<string>;
  venueAddress: VerifiableField<string>;
  eventDate: VerifiableField<string>;
  headliner: VerifiableField<string[]>;
  ticketUrl: VerifiableField<string>;
  /** Highest-priority actionable contact per the issue #159 ranking, or null when nothing is confirmed. */
  primaryContact: RankedContact | null;
  /** Remaining ranked contacts plus the ticketing link, always shown as supporting actions. */
  secondaryActions: RankedContact[];
  /** Overall confidence in `primaryContact`: "verified" (reconfirmed now), "likely" (known but unconfirmed), or "unverified" (nothing but ticketing/generic signals). */
  confidenceLevel: EnrichmentConfidenceLevel;
  lastVerifiedAt: string;
  warnings: string[];
}
