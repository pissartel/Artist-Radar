import { describe, expect, it } from "vitest";
import { rankContacts } from "../src/enrichment/contactPriority.js";
import type { EnrichedContact, VerifiableField } from "../src/enrichment/types.js";
import { HEADLINER_AGENCY_SEARCH_MARKER } from "../src/enrichment/types.js";

const NO_TICKET: VerifiableField<string> = { value: null, verified: false, sourceUrl: null };

function contact(overrides: Partial<EnrichedContact> = {}): EnrichedContact {
  return {
    type: "email",
    value: "contact@example.test",
    role: "UNKNOWN",
    sourceUrl: "https://venue.example.test/programming",
    verified: true,
    notes: null,
    ...overrides
  };
}

describe("rankContacts", () => {
  it("event with a verified organizer/promoter contact: promotes it to primaryContact with verified confidence", () => {
    const primarySourceUrl = "https://venue.example.test/programming";
    const result = rankContacts({
      contacts: [
        contact({ value: "booking@venue.example.test", role: "BOOKING", sourceUrl: primarySourceUrl, verified: true })
      ],
      socialProfiles: [],
      ticketUrl: NO_TICKET,
      headliners: [],
      primarySourceUrl
    });

    expect(result.primaryContact).toMatchObject({
      role: "organizer_promoter",
      value: "booking@venue.example.test",
      verified: true
    });
    expect(result.confidenceLevel).toBe("verified");
  });

  it("event with ticketing only: never promotes the ticket link to primaryContact, keeps it as a secondary action", () => {
    const result = rankContacts({
      contacts: [],
      socialProfiles: [],
      ticketUrl: { value: "https://tickets.example.test/show", verified: true, sourceUrl: "https://venue.example.test" },
      headliners: [],
      primarySourceUrl: "https://venue.example.test"
    });

    expect(result.primaryContact).toBeNull();
    expect(result.confidenceLevel).toBe("unverified");
    expect(result.secondaryActions).toEqual([
      { role: "ticketing", type: "unknown", value: "https://tickets.example.test/show", sourceUrl: "https://venue.example.test", verified: true }
    ]);
  });

  it("event with no verified contact: primaryContact is null and confidence reflects the unconfirmed carried-over contact", () => {
    const result = rankContacts({
      contacts: [
        contact({ value: "old-booking@venue.example.test", role: "BOOKING", sourceUrl: "https://venue.example.test", verified: false })
      ],
      socialProfiles: [],
      ticketUrl: NO_TICKET,
      headliners: [],
      primarySourceUrl: "https://venue.example.test"
    });

    expect(result.primaryContact).toBeNull();
    expect(result.confidenceLevel).toBe("likely");
    expect(result.secondaryActions).toEqual([
      { role: "organizer_promoter", type: "email", value: "old-booking@venue.example.test", sourceUrl: "https://venue.example.test", verified: false }
    ]);
  });

  it("classifies a booking contact found on a different page than the opportunity's own source as venue_booking, not organizer_promoter", () => {
    const result = rankContacts({
      contacts: [
        contact({ value: "booking@othervenue.test", role: "BOOKING", sourceUrl: "https://othervenue.test/contact", verified: true })
      ],
      socialProfiles: [],
      ticketUrl: NO_TICKET,
      headliners: [],
      primarySourceUrl: "https://venue.example.test"
    });

    expect(result.primaryContact?.role).toBe("venue_booking");
  });

  it("ranks a headliner agency contact found via search below organizer/promoter and venue booking", () => {
    const primarySourceUrl = "https://venue.example.test";
    const result = rankContacts({
      contacts: [
        contact({ value: "booking@venue.example.test", role: "BOOKING", sourceUrl: primarySourceUrl, verified: true }),
        contact({
          type: "email",
          value: "agent@bigagency.test",
          role: "BOOKING",
          sourceUrl: "https://bigagency.test",
          verified: true,
          notes: HEADLINER_AGENCY_SEARCH_MARKER
        })
      ],
      socialProfiles: [],
      ticketUrl: NO_TICKET,
      headliners: ["Headline Band"],
      primarySourceUrl
    });

    expect(result.primaryContact?.role).toBe("organizer_promoter");
    expect(result.secondaryActions).toContainEqual(
      expect.objectContaining({ role: "headliner_agency", value: "agent@bigagency.test" })
    );
  });

  it("prefers a contact form over an organizer social profile", () => {
    const primarySourceUrl = "https://venue.example.test";
    const result = rankContacts({
      contacts: [
        contact({ type: "contact_form", value: "https://venue.example.test/contact", role: "GENERAL", sourceUrl: primarySourceUrl, verified: true })
      ],
      socialProfiles: [{ value: "https://instagram.com/venue", verified: true, sourceUrl: primarySourceUrl }],
      ticketUrl: NO_TICKET,
      headliners: [],
      primarySourceUrl
    });

    expect(result.primaryContact?.role).toBe("contact_form");
    expect(result.secondaryActions).toContainEqual(
      expect.objectContaining({ role: "organizer_social", value: "https://instagram.com/venue" })
    );
  });

  it("deduplicates a social URL appearing both as a contact and as a social profile", () => {
    const primarySourceUrl = "https://venue.example.test";
    const result = rankContacts({
      contacts: [
        contact({ type: "social", value: "https://instagram.com/venue", role: "UNKNOWN", sourceUrl: primarySourceUrl, verified: true })
      ],
      socialProfiles: [{ value: "https://instagram.com/venue", verified: true, sourceUrl: primarySourceUrl }],
      ticketUrl: NO_TICKET,
      headliners: [],
      primarySourceUrl
    });

    const allRanked = [result.primaryContact, ...result.secondaryActions].filter(Boolean);
    expect(allRanked.filter((entry) => entry?.value === "https://instagram.com/venue")).toHaveLength(1);
  });
});
