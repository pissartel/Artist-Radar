import { describe, expect, it } from "vitest";
import { getSourceLinkLabel } from "@/components/dashboard/OpportunityDetail";

describe("getSourceLinkLabel", () => {
  it("labels a venue's listing/agenda page source as 'View venue programme'", () => {
    expect(getSourceLinkLabel("https://quai-m.fr/agenda", "venue")).toBe("View venue programme ↗");
    expect(getSourceLinkLabel("https://example.com/events", "venue")).toBe("View venue programme ↗");
    expect(getSourceLinkLabel("https://example.com/programmation", "organization")).toBe("View venue programme ↗");
  });

  it("labels a venue's plain homepage source as 'Visit website'", () => {
    expect(getSourceLinkLabel("https://quai-m.fr/", "venue")).toBe("Visit website ↗");
    expect(getSourceLinkLabel("https://example.com/about", "organization")).toBe("Visit website ↗");
  });

  it("keeps 'View original event page' for a concert/festival opportunity regardless of URL shape", () => {
    expect(getSourceLinkLabel("https://quai-m.fr/agenda", "event")).toBe("View original event page ↗");
    expect(getSourceLinkLabel("https://example.com/concert-123", "event")).toBe("View original event page ↗");
  });

  it("falls back to 'Visit website' for a malformed venue source URL rather than throwing", () => {
    expect(getSourceLinkLabel("not-a-url", "venue")).toBe("Visit website ↗");
  });
});
