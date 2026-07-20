import { describe, expect, it } from "vitest";
import {
  getAdditionalMetadata,
  getGroupedContacts,
  getRecommendedAction,
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
