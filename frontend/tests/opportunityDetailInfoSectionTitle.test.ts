import { describe, expect, it } from "vitest";
import { INFO_SECTION_TITLES } from "@/components/dashboard/OpportunityDetail";

describe("INFO_SECTION_TITLES", () => {
  it("labels a venue-type opportunity's facts card 'Venue information', never 'Event information'", () => {
    // Reported bug: a venue-type opportunity IS the venue, not an event —
    // its own detail page must never call its facts "Event information".
    expect(INFO_SECTION_TITLES.venue).toBe("Venue information");
    expect(INFO_SECTION_TITLES.venue).not.toBe("Event information");
  });

  it("labels an organization-type opportunity's facts card 'Organization information'", () => {
    expect(INFO_SECTION_TITLES.organization).toBe("Organization information");
  });

  it("keeps 'Event information' for a concert/festival/opening-slot opportunity", () => {
    expect(INFO_SECTION_TITLES.event).toBe("Event information");
  });
});
