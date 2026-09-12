import { beforeEach, describe, expect, it, vi } from "vitest";

const runDeepManagerSearch = vi.fn();
vi.mock("@/lib/server/backendPipeline", () => ({
  runDeepManagerSearch: (...args: unknown[]) => runDeepManagerSearch(...args),
}));

function request(body: unknown): Request {
  return new Request("http://localhost/api/artist-radar/managers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  artist: "Tuesday Fall",
  city: "Paris",
  country: "France",
  genre: "pop punk",
  artistTier: "small",
  similarArtists: [{ name: "Neon Riot", genres: ["pop punk"], city: "Lyon", country: "France", artistTier: "small" }],
};

describe("POST /api/artist-radar/managers", () => {
  beforeEach(() => runDeepManagerSearch.mockReset());

  it("rejects requests without usable similar-artist seeds", async () => {
    const { POST } = await import("@/app/api/artist-radar/managers/route");
    const response = await POST(request({ ...validBody, similarArtists: [] }));
    expect(response.status).toBe(400);
    expect(runDeepManagerSearch).not.toHaveBeenCalled();
  });

  it("hard-codes deep mode and returns mapped sourced results", async () => {
    runDeepManagerSearch.mockResolvedValueOnce({
      opportunities: [{
        id: "scene-management",
        name: "Scene Management",
        opportunityType: "management_company",
        sourceUrl: "https://management.example/roster",
        associatedArtists: ["Neon Riot"],
        associatedGenres: ["pop punk"],
        audienceLevel: "small",
        sources: [{ name: "official roster", url: "https://management.example/roster" }],
        compatibilityScore: 84,
        compatibilityExplanation: "Connected through Neon Riot.",
        manager: {
          roster: ["Neon Riot"], relevantArtists: ["Neon Riot"], managerGenres: ["pop punk"],
          typicalAudienceLevel: "small", services: [], relationshipStatus: "current", isActive: true,
          evidence: [{ sourceUrl: "https://management.example/roster", similarArtistName: "Neon Riot", relationshipStatus: "current", confidence: 0.9 }],
        },
      }],
      warnings: [],
      fromCache: true,
      metadata: { mode: "deep", keptOpportunities: 1 },
    });
    const { POST } = await import("@/app/api/artist-radar/managers/route");
    const response = await POST(request(validBody));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(runDeepManagerSearch).toHaveBeenCalledWith(expect.objectContaining({ mode: "deep", limit: 24 }));
    expect(payload).toMatchObject({ fromCache: true, opportunities: [{ title: "Scene Management", type: "manager" }] });
  });
});
