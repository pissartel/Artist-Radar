import { describe, expect, it, vi } from "vitest";
import { SupabaseArtistSimilarityGraphStore } from "../src/services/supabaseArtistSimilarityGraphStore.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("SupabaseArtistSimilarityGraphStore canonical identity", () => {
  it("reuses an artist found through a stable provider ID and attaches new IDs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([{ artist_id: "artist-1" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const store = new SupabaseArtistSimilarityGraphStore({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret"
    });

    await expect(store.resolveArtist({
      name: "Tuesday Fall",
      spotifyId: "spotify-1",
      musicBrainzId: "mb-1"
    })).resolves.toBe("artist-1");

    const patchBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(patchBody).not.toHaveProperty("identity_key");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("global_artist_external_ids");
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain("global_artist_external_ids");
    fetchMock.mockRestore();
  });

  it("reuses a unique normalized-name match when no stable ID is available", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([{ id: "artist-by-name" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const store = new SupabaseArtistSimilarityGraphStore({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret"
    });

    await expect(store.resolveArtist({ name: "AC/DC" }))
      .resolves.toBe("artist-by-name");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("normalized_name=eq.ac%20dc");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST" && String(init.body).includes("normalized_name")))
      .toBe(false);
    fetchMock.mockRestore();
  });

  it("does not merge an unknown stable ID through a same-name match", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([{ id: "new-phoenix" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const store = new SupabaseArtistSimilarityGraphStore({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret"
    });

    await expect(store.resolveArtist({ name: "Phoenix", spotifyId: "new-spotify-id" }))
      .resolves.toBe("new-phoenix");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("normalized_name="))).toBe(false);
    const insertBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(insertBody.identity_key).toBe("spotify:new-spotify-id");
    fetchMock.mockRestore();
  });

  it("does not erase canonical metadata when resolving a sparse identity", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([{ artist_id: "artist-1" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const store = new SupabaseArtistSimilarityGraphStore({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret"
    });

    await store.resolveArtist({ name: "Sparse Artist", spotifyId: "spotify-1" });

    const patchBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(patchBody).not.toHaveProperty("genres");
    expect(patchBody).not.toHaveProperty("city");
    expect(patchBody).not.toHaveProperty("country");
    expect(patchBody).not.toHaveProperty("scale_band");
    expect(patchBody).not.toHaveProperty("profile_data");
    fetchMock.mockRestore();
  });

  it("merges existing source provenance when recomputing an edge", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([{
        artist_id: "artist-1",
        sources: ["spotify"],
        evidence: { providerEvidence: { spotify: { confidence: 0.7 } } }
      }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const store = new SupabaseArtistSimilarityGraphStore({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret"
    });

    await expect(store.upsertEdge({
      artistId: "artist-1",
      similarArtistId: "artist-2",
      score: 82,
      scoreVersion: "similarity-v1",
      genreScore: 90,
      audienceScore: 70,
      geographyScore: 60,
      providerScore: 80,
      confidence: 0.8,
      sources: ["chartmetric"],
      lastComputedAt: "2026-09-19T00:00:00.000Z",
      nextRefreshAt: "2026-10-03T00:00:00.000Z",
      result: { name: "Neighbor" } as never
    })).resolves.toBe("recomputed");

    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(body.sources).toEqual(["spotify", "chartmetric"]);
    expect(body.evidence.providerEvidence).toHaveProperty("spotify");
    expect(body.evidence.providerEvidence).toHaveProperty("chartmetric");
    fetchMock.mockRestore();
  });
});
