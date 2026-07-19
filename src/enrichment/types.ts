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
 * Minimal shape an opportunity must satisfy to be enriched. A `BookingTarget`
 * or `BookingOpportunity.target` already satisfies this structurally.
 */
export interface EnrichableOpportunity {
  name: string;
  sourceUrl: string | null;
  sourceType: BookingSourceType;
  contacts: ContactCandidate[];
  eventDate?: string | null;
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
  venueAddress: VerifiableField<string>;
  eventDate: VerifiableField<string>;
  headliner: VerifiableField<string[]>;
  ticketUrl: VerifiableField<string>;
  lastVerifiedAt: string;
  warnings: string[];
}
