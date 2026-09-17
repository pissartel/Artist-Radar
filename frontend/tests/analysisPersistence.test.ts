import { describe, expect, it } from "vitest";
import {
  ANALYSIS_CACHE_VERSION,
  ANALYSIS_CACHE_TTL_SECONDS,
  analysisFingerprint,
} from "@/lib/server/analysisPersistence";

describe("analysis persistence", () => {
  it("uses stable normalized request fingerprints and ignores execution IDs", () => {
    const first = analysisFingerprint({
      artistName: " Tuesday Fall ",
      genre: "Pop Punk",
      location: "Bordeaux",
      enableBooking: true,
      executionId: "first-run",
    });
    const second = analysisFingerprint({
      artistName: "tuesday fall",
      genre: "pop punk",
      location: "bordeaux",
      enableBooking: true,
      executionId: "second-run",
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes the fingerprint when analysis input changes", () => {
    const base = {
      artistName: "Tuesday Fall",
      genre: "pop punk",
      location: "Bordeaux",
      enableBooking: true,
    };

    expect(analysisFingerprint(base)).not.toBe(
      analysisFingerprint({ ...base, location: "Paris" })
    );
  });

  it("includes every result-affecting request field", () => {
    const base = {
      artistName: "Tuesday Fall",
      genre: "pop punk",
      location: "Paris",
      referenceCountry: "France",
      spotifyUrl: "https://open.spotify.com/artist/tuesday-fall",
      enableBooking: true,
    };

    expect(analysisFingerprint({ ...base, referenceCountry: "Belgium" })).not.toBe(
      analysisFingerprint(base)
    );
    expect(analysisFingerprint({ ...base, spotifyUrl: undefined })).not.toBe(
      analysisFingerprint(base)
    );
    expect(analysisFingerprint({ ...base, enableBooking: false })).not.toBe(
      analysisFingerprint(base)
    );
    expect(
      analysisFingerprint({
        ...base,
        features: { chartmetricArtistEnrichment: true },
      })
    ).not.toBe(analysisFingerprint(base));
  });

  it("uses the explicit booking cache version and a short freshness window", () => {
    expect(ANALYSIS_CACHE_VERSION).toBe("booking-v3");
    expect(ANALYSIS_CACHE_TTL_SECONDS).toBe(15 * 60);
  });
});
