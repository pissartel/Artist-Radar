import { beforeEach, describe, expect, it, vi } from "vitest";

const runDeepBookerSearch = vi.fn();
vi.mock("@/lib/server/backendPipeline", () => ({
  runDeepBookerSearch: (...args: unknown[]) => runDeepBookerSearch(...args),
}));

const validBody = {
  artist: "Tuesday Fall",
  city: "Paris",
  country: "France",
  genre: "pop punk",
  similarArtists: [{
    name: "Mirabelle", genres: ["pop punk"], city: "Paris", country: "France",
    artistTier: "small", bookingCategory: "local_peer",
  }],
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/artist-radar/bookers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/artist-radar/bookers", () => {
  beforeEach(() => runDeepBookerSearch.mockReset());

  it("rejects a request without similar-artist seeds", async () => {
    const { POST } = await import("@/app/api/artist-radar/bookers/route");
    const response = await POST(request({ ...validBody, similarArtists: [] }));
    expect(response.status).toBe(400);
    expect(runDeepBookerSearch).not.toHaveBeenCalled();
  });

  it("uses deep mode and returns mapped bookers", async () => {
    runDeepBookerSearch.mockResolvedValueOnce({
      opportunities: [{
        id: "rage-tour", name: "Rage Tour", opportunityType: "booking_agency",
        sourceUrl: "https://www.ragetour.com", websiteUrl: "https://www.ragetour.com",
        associatedArtists: ["Mirabelle"], associatedGenres: ["pop punk"], audienceLevel: "medium",
        geographicScope: "national", sources: [{ name: "official", url: "https://www.ragetour.com" }],
        compatibilityScore: 88, compatibilityExplanation: "French punk booking fit.",
      }],
      warnings: [], metadata: { mode: "deep", keptOpportunities: 1 },
    });
    const { POST } = await import("@/app/api/artist-radar/bookers/route");
    const response = await POST(request(validBody));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(runDeepBookerSearch).toHaveBeenCalledWith(expect.objectContaining({ mode: "deep", limit: 24 }));
    expect(payload.opportunities[0]).toMatchObject({ title: "Rage Tour", type: "booker" });
  });
});
