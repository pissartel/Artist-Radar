import { describe, expect, it } from "vitest";
import { classifyVerification } from "../src/providers/openaiConcerts/verification.js";

describe("classifyVerification", () => {
  it("confirms an event with an official venue source", () => {
    const status = classifyVerification({ sourceTypes: ["venue_official"], hasVenue: true, hasCompleteDate: true });
    expect(status).toBe("confirmed");
  });

  it("confirms an event with an official artist source", () => {
    const status = classifyVerification({ sourceTypes: ["artist_official"], hasVenue: true, hasCompleteDate: true });
    expect(status).toBe("confirmed");
  });

  it("confirms an event with a trusted ticketing source", () => {
    const status = classifyVerification({ sourceTypes: ["ticketing"], hasVenue: true, hasCompleteDate: true });
    expect(status).toBe("confirmed");
  });

  it("confirms an event with two independent credible agenda/press sources agreeing", () => {
    const status = classifyVerification({ sourceTypes: ["cultural_agenda", "press"], hasVenue: true, hasCompleteDate: true });
    expect(status).toBe("confirmed");
  });

  it("marks one credible cultural-agenda source as probable", () => {
    const status = classifyVerification({ sourceTypes: ["cultural_agenda"], hasVenue: true, hasCompleteDate: true });
    expect(status).toBe("probable");
  });

  it("marks one credible press source as probable", () => {
    const status = classifyVerification({ sourceTypes: ["press"], hasVenue: true, hasCompleteDate: true });
    expect(status).toBe("probable");
  });

  it("marks a social-only source as unverified", () => {
    const status = classifyVerification({ sourceTypes: ["social"], hasVenue: true, hasCompleteDate: true });
    expect(status).toBe("unverified");
  });

  it("marks missing venue as unverified even with an official source", () => {
    const status = classifyVerification({ sourceTypes: ["venue_official"], hasVenue: false, hasCompleteDate: true });
    expect(status).toBe("unverified");
  });

  it("marks incomplete date as unverified even with an official source", () => {
    const status = classifyVerification({ sourceTypes: ["venue_official"], hasVenue: true, hasCompleteDate: false });
    expect(status).toBe("unverified");
  });

  it("marks zero sources as unverified", () => {
    const status = classifyVerification({ sourceTypes: [], hasVenue: true, hasCompleteDate: true });
    expect(status).toBe("unverified");
  });
});
