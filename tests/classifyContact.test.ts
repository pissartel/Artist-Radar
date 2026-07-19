import { describe, expect, it } from "vitest";
import { classifyContactRole } from "../src/enrichment/classifyContact.js";

describe("classifyContactRole", () => {
  it("classifies booking-labeled contacts as BOOKING", () => {
    expect(classifyContactRole("booking@venue.test", "Booking / Programmation")).toBe("BOOKING");
  });

  it("classifies management-labeled contacts as MANAGEMENT", () => {
    expect(classifyContactRole("mgmt@label.test", "Artist management")).toBe("MANAGEMENT");
  });

  it("classifies submission-labeled contacts as SUBMISSIONS", () => {
    expect(classifyContactRole("demo@venue.test", "Send us your demo / submissions")).toBe("SUBMISSIONS");
  });

  it("classifies partnership-labeled contacts as PARTNERSHIPS", () => {
    expect(classifyContactRole("partners@festival.test", "Sponsorship & partnership inquiries")).toBe("PARTNERSHIPS");
  });

  it("classifies press-labeled contacts as PRESS", () => {
    expect(classifyContactRole("press@venue.test", "Press / Media contact")).toBe("PRESS");
  });

  it("classifies generic info addresses as GENERAL", () => {
    expect(classifyContactRole("info@venue.test", "General contact")).toBe("GENERAL");
  });

  it("falls back to UNKNOWN when no signal is present", () => {
    expect(classifyContactRole("team@somewhere.test", "")).toBe("UNKNOWN");
  });

  it("prioritizes booking signal over a weaker generic label", () => {
    expect(classifyContactRole("booking@venue.test", "Contact / info")).toBe("BOOKING");
  });
});
