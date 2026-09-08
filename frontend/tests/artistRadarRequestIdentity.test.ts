import { describe, expect, it, vi } from "vitest";
import {
  buildArtistRadarQueryKey,
  selectRestoredArtistRadarRequest,
} from "@/lib/artistRadarRequestIdentity";
import type { ArtistRadarRequest } from "@/types/artistRadar";

const REQUEST: ArtistRadarRequest = {
  artistName: "Tuesday Fall",
  genre: "pop punk",
  location: "Paris",
  referenceCountry: "France",
  enableBooking: true,
  spotifyUrl: "https://open.spotify.com/artist/tuesday-fall",
};

describe("Artist Radar request identity", () => {
  it("does not create another execution for an unchanged restored analysis", () => {
    const createExecutionId = vi.fn(() => "second-execution");
    const current = { ...REQUEST, executionId: "first-execution" };

    expect(
      selectRestoredArtistRadarRequest(current, { ...REQUEST }, createExecutionId)
    ).toBe(current);
    expect(createExecutionId).not.toHaveBeenCalled();
  });

  it("creates a new execution only when restored analysis input genuinely changes", () => {
    const restored = { ...REQUEST, referenceCountry: "Belgium" };

    expect(
      selectRestoredArtistRadarRequest(REQUEST, restored, () => "new-execution")
    ).toEqual({ ...restored, executionId: "new-execution" });
  });

  it("keys React Query by every semantic request field", () => {
    const baseKey = buildArtistRadarQueryKey(REQUEST);

    expect(buildArtistRadarQueryKey({ ...REQUEST, referenceCountry: "Belgium" })).not.toEqual(baseKey);
    expect(buildArtistRadarQueryKey({ ...REQUEST, spotifyUrl: "https://open.spotify.com/artist/other" })).not.toEqual(baseKey);
    expect(buildArtistRadarQueryKey({ ...REQUEST, previewData: true })).not.toEqual(baseKey);
    expect(
      buildArtistRadarQueryKey({
        ...REQUEST,
        features: { chartmetricArtistEnrichment: true },
      })
    ).not.toEqual(baseKey);
    expect(buildArtistRadarQueryKey({ ...REQUEST, executionId: "another-run" })).toEqual(baseKey);
  });
});
