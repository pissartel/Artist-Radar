import { describe, expect, it } from "vitest";
import { analysisFingerprint } from "@/lib/server/analysisPersistence";

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
});
