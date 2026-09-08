import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearArtistRadarResponse,
  readArtistRadarResponse,
  writeArtistRadarResponse,
} from "@/lib/artistRadarResponseCache";
import type { ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";

const REQUEST: ArtistRadarRequest = {
  artistName: "Tuesday Fall",
  genre: "pop punk",
  location: "Bordeaux",
  enableBooking: true,
};

const RESPONSE = {
  artist: { name: "Tuesday Fall" },
  warnings: [],
} as unknown as ArtistRadarResponse;

function createFakeSessionStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("Artist Radar response cache", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { sessionStorage: createFakeSessionStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores a completed response for the same request after a refresh", () => {
    writeArtistRadarResponse(REQUEST, RESPONSE);

    expect(readArtistRadarResponse({ ...REQUEST, executionId: "new-execution" })).toEqual(RESPONSE);
  });

  it("does not restore data belonging to a different artist request", () => {
    writeArtistRadarResponse(REQUEST, RESPONSE);

    expect(readArtistRadarResponse({ ...REQUEST, artistName: "Another Artist" })).toBeUndefined();
  });

  it("does not reuse a response for a different reference country", () => {
    writeArtistRadarResponse({ ...REQUEST, referenceCountry: "France" }, RESPONSE);

    expect(
      readArtistRadarResponse({ ...REQUEST, referenceCountry: "Belgium" })
    ).toBeUndefined();
  });

  it("does not reuse a response for different preview or feature inputs", () => {
    writeArtistRadarResponse(REQUEST, RESPONSE);

    expect(readArtistRadarResponse({ ...REQUEST, previewData: true })).toBeUndefined();
    expect(
      readArtistRadarResponse({
        ...REQUEST,
        features: { chartmetricArtistEnrichment: true },
      })
    ).toBeUndefined();
  });

  it("ignores malformed stored data", () => {
    window.sessionStorage.setItem("artistRadarResponse:v1", "{not-json");

    expect(readArtistRadarResponse(REQUEST)).toBeUndefined();
  });

  it("clears a previous response before a new analysis", () => {
    writeArtistRadarResponse(REQUEST, RESPONSE);
    clearArtistRadarResponse();

    expect(readArtistRadarResponse(REQUEST)).toBeUndefined();
  });
});
