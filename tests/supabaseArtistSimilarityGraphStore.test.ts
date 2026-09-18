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

  it("reuses a unique normalized-name match before inserting a new artist", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([{ id: "artist-by-name" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const store = new SupabaseArtistSimilarityGraphStore({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret"
    });

    await expect(store.resolveArtist({ name: "AC/DC", spotifyId: "spotify-acdc" }))
      .resolves.toBe("artist-by-name");

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("normalized_name=eq.ac%20dc");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST" && String(init.body).includes("normalized_name")))
      .toBe(false);
    fetchMock.mockRestore();
  });
});
