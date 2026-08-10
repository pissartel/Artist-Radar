import { describe, expect, it } from "vitest";
import {
  getAdditionalMetadata,
  getContactActionForValue,
  getGroupedContacts,
  getLineupCompletenessLabel,
  getLineupEntries,
  getOpportunitySource,
  getOpportunitySignal,
  getRecommendedAction,
  getSourceEvidence,
  getSourceEvidenceExcluding,
  getVenueTypeLabel,
  hasLiveEventInfo,
  isLiveEventOpportunity,
} from "@/lib/opportunity";
import type { Opportunity } from "@/types";

function buildOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp-1",
    type: "concert",
    category: "concert",
    title: "Le Point Ephemere",
    location: "Paris, France",
    description: "Reach out via the booking form and mention your last tour dates.",
    tags: [],
    matchScore: 82,
    matchReasons: ["Genre match", "Local scene fit"],
    genres: [],
    recentEvents: [],
    lineup: [],
    ...overrides,
  };
}

describe("isLiveEventOpportunity", () => {
  it("treats concert, festival and opening_slot as live events", () => {
    expect(isLiveEventOpportunity(buildOpportunity({ type: "concert" }))).toBe(true);
    expect(isLiveEventOpportunity(buildOpportunity({ type: "festival" }))).toBe(true);
    expect(isLiveEventOpportunity(buildOpportunity({ type: "opening_slot" }))).toBe(true);
  });

  it("does not treat a venue (organization) as a live event", () => {
    expect(isLiveEventOpportunity(buildOpportunity({ type: "venue" }))).toBe(false);
  });
});

describe("hasLiveEventInfo", () => {
  it("is false for a live event type with no event-specific data", () => {
    expect(hasLiveEventInfo(buildOpportunity({ type: "concert", city: undefined, date: undefined }))).toBe(false);
  });

  it("is true once at least one event field is present", () => {
    expect(hasLiveEventInfo(buildOpportunity({ type: "concert", venue: "Le Point Ephemere" }))).toBe(true);
  });

  it("is false for a non-live-event type even with a date set", () => {
    expect(hasLiveEventInfo(buildOpportunity({ type: "venue", date: "2026-08-01" }))).toBe(false);
  });
});

describe("getRecommendedAction", () => {
  it("prefers an explicit recommendedAction over the description", () => {
    const opportunity = buildOpportunity({
      description: "fallback text",
      recommendedAction: "Email the booking contact with your EPK.",
    });
    expect(getRecommendedAction(opportunity)).toBe("Email the booking contact with your EPK.");
  });

  it("falls back to the description when recommendedAction is absent", () => {
    const opportunity = buildOpportunity({ description: "Reach out via the booking form." });
    expect(getRecommendedAction(opportunity)).toBe("Reach out via the booking form.");
  });

  it("returns null when neither field has content", () => {
    const opportunity = buildOpportunity({ description: "" });
    expect(getRecommendedAction(opportunity)).toBeNull();
  });
});

describe("getOpportunitySource", () => {
  it("never exposes internal provider names as user-facing sources", () => {
    const opportunity = buildOpportunity({
      sourceProvider: "openai_web_search",
      sourceUrls: ["https://venue.example/events"],
    });

    expect(getOpportunitySource(opportunity)).toBe("venue.example");
  });
});

describe("getGroupedContacts", () => {
  it("groups structured contacts by purpose in a fixed order", () => {
    const opportunity = buildOpportunity({
      contacts: [
        { purpose: "press", label: "Press", value: "press@venue.test" },
        { purpose: "booking", label: "Booking", value: "booking@venue.test" },
      ],
    });
    const groups = getGroupedContacts(opportunity);
    expect(groups.map((group) => group.purpose)).toEqual(["booking", "press"]);
  });

  it("falls back to the legacy single contact string as an unclassified General entry", () => {
    const opportunity = buildOpportunity({ contact: "booking@venue.test" });
    const groups = getGroupedContacts(opportunity);
    expect(groups).toHaveLength(1);
    expect(groups[0].purpose).toBe("general");
    expect(groups[0].contacts[0].value).toBe("booking@venue.test");
  });

  it("returns no groups when there is no contact information", () => {
    expect(getGroupedContacts(buildOpportunity())).toEqual([]);
  });
});

describe("getAdditionalMetadata", () => {
  it("includes tags and explicit metadata entries", () => {
    const opportunity = buildOpportunity({
      tags: ["diy", "all-ages"],
      metadata: [{ label: "Capacity", value: "300" }],
    });
    expect(getAdditionalMetadata(opportunity)).toEqual([
      { label: "Tags", value: "diy, all-ages" },
      { label: "Capacity", value: "300" },
    ]);
  });

  it("returns an empty list when there is nothing extra to show", () => {
    expect(getAdditionalMetadata(buildOpportunity())).toEqual([]);
  });
});

describe("getLineupEntries", () => {
  it("prefers structured lineupEntries over the flat lineup/headliner strings", () => {
    const opportunity = buildOpportunity({
      lineup: ["Should be ignored"],
      lineupEntries: [{ name: "Artist A", position: "support" }],
    });
    expect(getLineupEntries(opportunity)).toEqual([{ name: "Artist A", position: "support" }]);
  });

  it("marks headliner names as headliner and leaves other names without a guessed position", () => {
    const opportunity = buildOpportunity({
      lineup: ["Headline Act", "Support Act"],
      headliner: ["Headline Act"],
    });
    expect(getLineupEntries(opportunity)).toEqual([
      { name: "Headline Act", position: "headliner" },
      { name: "Support Act" },
    ]);
  });

  it("returns an empty list when there is no lineup information", () => {
    expect(getLineupEntries(buildOpportunity({ lineup: [] }))).toEqual([]);
  });
});

describe("getVenueTypeLabel", () => {
  it("hides the generic venue type label", () => {
    expect(getVenueTypeLabel(buildOpportunity({ venueType: "venue" }))).toBeNull();
  });

  it("returns a human-readable label for a known venue type", () => {
    expect(getVenueTypeLabel(buildOpportunity({ venueType: "cultural_centre" }))).toBe("Cultural Centre");
  });

  it("falls back to the raw value for an unknown venue type", () => {
    expect(getVenueTypeLabel(buildOpportunity({ venueType: "warehouse" }))).toBe("warehouse");
  });

  it("returns null when no venue type is known", () => {
    expect(getVenueTypeLabel(buildOpportunity())).toBeNull();
  });
});

describe("getSourceEvidence", () => {
  it("prefers structured sourceEvidence over the flat sourceUrls", () => {
    const opportunity = buildOpportunity({
      sourceUrls: ["https://ignored.test"],
      sourceEvidence: [{ url: "https://venue.example/event", title: "Venue listing", retrievedInfo: "Date and lineup" }],
    });
    expect(getSourceEvidence(opportunity)).toEqual([
      {
        url: "https://venue.example/event",
        title: "Venue listing",
        website: "venue.example",
        retrievedInfo: "Date and lineup",
      },
    ]);
  });

  it("falls back to sourceUrls, listing every url with its hostname", () => {
    const opportunity = buildOpportunity({
      sourceUrls: ["https://a.example/1", "https://b.example/2"],
    });
    expect(getSourceEvidence(opportunity)).toEqual([
      { url: "https://a.example/1", title: null, website: "a.example", retrievedInfo: null },
      { url: "https://b.example/2", title: null, website: "b.example", retrievedInfo: null },
    ]);
  });

  it("returns an empty list when there are no sources", () => {
    expect(getSourceEvidence(buildOpportunity())).toEqual([]);
  });
});

// PR #218 review feedback: "Source and ticketing" and "Source evidence" must
// never repeat the exact same source/URL as two separate cards.
describe("getSourceEvidenceExcluding", () => {
  it("filters out evidence whose URL is already shown elsewhere (e.g. as the event source)", () => {
    const opportunity = buildOpportunity({
      sourceUrls: ["https://songkick.example/events/123"],
    });
    expect(getSourceEvidenceExcluding(opportunity, ["https://songkick.example/events/123"])).toEqual([]);
  });

  it("ignores trivial URL differences (trailing slash) when comparing", () => {
    const opportunity = buildOpportunity({
      sourceUrls: ["https://songkick.example/events/123/"],
    });
    expect(getSourceEvidenceExcluding(opportunity, ["https://songkick.example/events/123"])).toEqual([]);
  });

  it("keeps evidence whose URL is genuinely distinct from the excluded URLs", () => {
    const opportunity = buildOpportunity({
      sourceEvidence: [
        { url: "https://songkick.example/events/123", title: "Event listing" },
        { url: "https://venue.example/programme", title: "Venue programme" },
      ],
    });
    const result = getSourceEvidenceExcluding(opportunity, ["https://songkick.example/events/123"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe("https://venue.example/programme");
  });

  it("ignores null/undefined excluded URLs", () => {
    const opportunity = buildOpportunity({ sourceUrls: ["https://a.example/1"] });
    expect(getSourceEvidenceExcluding(opportunity, [null, undefined])).toHaveLength(1);
  });
});

describe("getOpportunitySignal", () => {
  it("flags an open call organization", () => {
    const opportunity = buildOpportunity({ type: "organization", organizationType: "open_call" });
    expect(getOpportunitySignal(opportunity).kind).toBe("open_call");
  });

  it("flags a venue as a contact-for-future-booking opportunity", () => {
    const opportunity = buildOpportunity({ type: "venue" });
    expect(getOpportunitySignal(opportunity).kind).toBe("venue_contact");
  });

  it("flags a live event with a support-slot signal", () => {
    const opportunity = buildOpportunity({
      type: "concert",
      matchBreakdown: {
        overallScore: 80,
        positiveFactors: [{ code: "support_slot_signal", label: "Support slot announced", impact: "positive" }],
        negativeFactors: [],
        neutralFactors: [],
      },
    });
    expect(getOpportunitySignal(opportunity).kind).toBe("support_slot_available");
  });

  it("falls back to a general event when there is no confirmed opportunity signal", () => {
    const opportunity = buildOpportunity({ type: "concert" });
    expect(getOpportunitySignal(opportunity).kind).toBe("general_event");
  });
});

describe("getLineupCompletenessLabel", () => {
  it("returns null when there is no lineup information", () => {
    expect(getLineupCompletenessLabel(buildOpportunity({ lineup: [] }))).toBeNull();
  });

  it("says only the headliner is confirmed when that is the only entry", () => {
    const opportunity = buildOpportunity({ headliner: ["Headline Act"], lineup: ["Headline Act"] });
    expect(getLineupCompletenessLabel(opportunity)).toBe(
      "Headliner confirmed — rest of the lineup not yet announced",
    );
  });

  it("counts every listed artist without claiming the lineup is final", () => {
    const opportunity = buildOpportunity({
      headliner: ["Headline Act"],
      lineup: ["Headline Act", "Support Act"],
    });
    expect(getLineupCompletenessLabel(opportunity)).toBe("2 artists listed");
  });
});

describe("getContactActionForValue", () => {
  it("turns an email into a mailto link", () => {
    expect(getContactActionForValue("booking@venue.test")).toEqual({
      href: "mailto:booking@venue.test",
      label: "Contact",
    });
  });

  it("returns null for an empty or missing contact", () => {
    expect(getContactActionForValue(null)).toBeNull();
    expect(getContactActionForValue(undefined)).toBeNull();
    expect(getContactActionForValue("  ")).toBeNull();
  });

  it("never fabricates a link from free text that isn't itself usable", () => {
    expect(getContactActionForValue("Ask at the door")).toBeNull();
  });
});
