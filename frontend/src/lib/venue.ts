import type { Opportunity, OpportunityContact } from "@/types";
import { getVenueTypeLabel } from "@/lib/opportunity";

// Canonical venue entity (issue #213), derived from whichever booking
// opportunities resolved a venueId — there is no separate venue database in
// the MVP pipeline, so the venue page is built from the richest opportunity
// data available for that venueId rather than a standalone fetch.
export interface VenueInfo {
  id: string;
  name: string;
  imageUrl?: string;
  venueTypeLabel: string | null;
  description?: string;
  address?: string;
  postalCode?: string;
  region?: string;
  city?: string;
  country?: string;
  capacity?: number | null;
  confidence?: number | null;
  website?: string;
  // Public contact string (email/url/phone), when one was found for this
  // venue — never fabricated. Reuses the same contact the opportunity page
  // already shows; never a separate, invented booking contact.
  contact?: string | null;
  contacts?: OpportunityContact[];
  sourceUrl?: string | null;
  sourceUrls?: string[];
  venueType?: string | null;
}

// Opportunities that resolved to the same venueId (issue #213) — used both
// to build the canonical VenueInfo (merging the most complete known fields)
// and to list the events happening there on the venue's own page.
export function getOpportunitiesForVenue(opportunities: Opportunity[], venueId: string): Opportunity[] {
  return opportunities.filter((opportunity) => opportunity.venueId === venueId);
}

// Merges fields across every opportunity resolved to this venue so the
// canonical page is as complete as any single source, never overwriting an
// already-known field with a missing one from another opportunity.
export function getVenueById(opportunities: Opportunity[], venueId: string): VenueInfo | null {
  const matches = getOpportunitiesForVenue(opportunities, venueId);
  if (matches.length === 0) return null;

  const venueTypeSource = matches.find((opportunity) => opportunity.venueType) ?? matches[0];
  const sourceUrls = [...new Set(matches.flatMap((opportunity) => opportunity.sourceUrls ?? []))];
  const postalCode = matches.find((opportunity) => opportunity.postalCode)?.postalCode;
  const venueType = matches.find((opportunity) => opportunity.venueType)?.venueType ?? null;

  return {
    id: venueId,
    name: matches.find((opportunity) => opportunity.venue)?.venue ?? matches[0].venue ?? "Unknown venue",
    imageUrl: matches.find((opportunity) => opportunity.venueImageUrl)?.venueImageUrl,
    venueTypeLabel: getVenueTypeLabel(venueTypeSource),
    description: matches.find((opportunity) => opportunity.venueDescription)?.venueDescription,
    address: matches.find((opportunity) => opportunity.address)?.address,
    ...(postalCode ? { postalCode } : {}),
    city: matches.find((opportunity) => opportunity.city)?.city,
    country: matches.find((opportunity) => opportunity.country)?.country,
    capacity: matches.find((opportunity) => opportunity.venueCapacity != null)?.venueCapacity ?? null,
    confidence: matches.find((opportunity) => opportunity.venueConfidence != null)?.venueConfidence ?? null,
    website: matches.find((opportunity) => opportunity.venueWebsite)?.venueWebsite,
    contact: matches.find((opportunity) => opportunity.contact)?.contact ?? null,
    contacts: matches.flatMap((opportunity) => opportunity.contacts ?? [])
      .filter((contact, index, contacts) =>
        contacts.findIndex((candidate) => candidate.value === contact.value && candidate.purpose === contact.purpose) === index
      ),
    ...(sourceUrls[0] ? { sourceUrl: sourceUrls[0] } : {}),
    ...(sourceUrls.length > 0 ? { sourceUrls } : {}),
    ...(venueType ? { venueType } : {}),
  };
}
