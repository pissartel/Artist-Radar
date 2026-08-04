import { describe, expect, it } from "vitest";
import { isLikelyEventUrl, isLikelyVenueUrl, resolveVenueOfficialUrl } from "../src/booking/venueUrl.js";

describe("isLikelyEventUrl", () => {
  it("flags a specific event/ticket page from the issue's own example", () => {
    expect(isLikelyEventUrl("https://example.com/events/artist-a-quai-m")).toBe(true);
  });

  it("flags a dated event permalink (razibus.net style)", () => {
    expect(isLikelyEventUrl("https://razibus.net/19-08-2026-the-tensions-karkass-guinguette-eau-la-bourgnac-35763.html")).toBe(true);
  });

  it("flags known aggregator/ticketing/social domains", () => {
    expect(isLikelyEventUrl("https://songkick.com/artists/mina-warren/calendar")).toBe(true);
    expect(isLikelyEventUrl("https://www.instagram.com/p/DTizQeyCNWO/")).toBe(true);
    expect(isLikelyEventUrl("https://bandsintown.com/e/neon-riot-monsters-art")).toBe(true);
  });

  it("does not flag a venue's own homepage", () => {
    expect(isLikelyEventUrl("https://quai-m.fr")).toBe(false);
    expect(isLikelyEventUrl("https://quai-m.fr/agenda")).toBe(false);
  });

  it("treats a malformed URL as event-like (fail safe, never trusted as a venue site)", () => {
    expect(isLikelyEventUrl("not a url")).toBe(true);
  });
});

describe("isLikelyVenueUrl", () => {
  it("is the inverse of isLikelyEventUrl for a real URL", () => {
    expect(isLikelyVenueUrl("https://quai-m.fr")).toBe(true);
    expect(isLikelyVenueUrl("https://example.com/events/artist-a-quai-m")).toBe(false);
  });

  it("returns false for null/undefined without throwing", () => {
    expect(isLikelyVenueUrl(null)).toBe(false);
    expect(isLikelyVenueUrl(undefined)).toBe(false);
  });
});

describe("resolveVenueOfficialUrl", () => {
  it("prefers a verified venue-shaped candidate over an unverified one", () => {
    const resolved = resolveVenueOfficialUrl([
      { url: "https://example.com/events/artist-a-quai-m", verified: false },
      { url: "https://quai-m.fr", verified: true }
    ]);
    expect(resolved).toBe("https://quai-m.fr");
  });

  it("falls back to an unverified venue-shaped candidate when nothing verified qualifies", () => {
    const resolved = resolveVenueOfficialUrl([{ url: "https://quai-m.fr", verified: false }]);
    expect(resolved).toBe("https://quai-m.fr");
  });

  it("never resolves to an event-shaped URL even when it's the only candidate", () => {
    const resolved = resolveVenueOfficialUrl([{ url: "https://example.com/events/artist-a-quai-m", verified: false }]);
    expect(resolved).toBeNull();
  });

  it("returns null rather than guessing when no candidate qualifies", () => {
    expect(resolveVenueOfficialUrl([])).toBeNull();
    expect(resolveVenueOfficialUrl([{ url: null }, { url: undefined }])).toBeNull();
  });
});
