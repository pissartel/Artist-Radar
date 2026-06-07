import { describe, expect, it } from "vitest";
import {
  findSeedCandidatesByGenreAndTarget,
  loadSeedCandidates,
  validateSeedCandidateForRealMode
} from "../src/modules/similarArtistSeeds.js";

describe("similarArtistSeeds", () => {
  it("loads the France pop punk seed file", async () => {
    const seeds = await loadSeedCandidates();

    expect(seeds.some((seed) => seed.name === "Paris Pop Punk Collective")).toBe(true);
  });

  it("keeps mock-only seeds out of real mode", async () => {
    const realSeeds = await loadSeedCandidates(undefined, { mode: "real" });

    expect(realSeeds.some((seed) => seed.name === "Bordeaux Emo Rock Band")).toBe(false);
    expect(realSeeds.length).toBe(0);
  });

  it("matches pop punk Paris and France seeds", async () => {
    const matches = await findSeedCandidatesByGenreAndTarget(["pop punk"], "grandes villes françaises", "Paris");

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.country).toBe("France");
    expect(matches.some((seed) => seed.city === "Paris")).toBe(true);
  });

  it("matches other genres with generic helper data", async () => {
    const matches = await findSeedCandidatesByGenreAndTarget(
      ["metalcore"],
      "Paris",
      "Paris",
      Promise.resolve([
        {
          name: "Metalcore Paris Seed",
          genres: ["metalcore", "hardcore"],
          city: "Paris",
          country: "France",
          url: null,
          source: "manual_seed",
          notes: "Custom test seed.",
          estimatedTier: "small" as const
        }
      ])
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe("Metalcore Paris Seed");
  });

  it("rejects placeholder names and source-less seeds in real mode", () => {
    expect(
      validateSeedCandidateForRealMode({
        name: "Bordeaux Emo Rock Band",
        genres: ["emo pop"],
        city: "Bordeaux",
        country: "France",
        url: null,
        source: "manual_seed",
        notes: "Temporary mock seed.",
        estimatedTier: "medium",
        mockOnly: true
      })
    ).toBe(false);

    expect(
      validateSeedCandidateForRealMode({
        name: "Verified Paris Punk Trio",
        genres: ["punk rock"],
        city: "Paris",
        country: "France",
        url: null,
        source: "manual_seed",
        notes: "Real seed.",
        estimatedTier: "small",
        verified: true,
        sourceUrl: "https://example.com/verified-seed"
      })
    ).toBe(true);

    expect(
      validateSeedCandidateForRealMode({
        name: "Source Less Paris Punk Trio",
        genres: ["punk rock"],
        city: "Paris",
        country: "France",
        url: null,
        source: "manual_seed",
        notes: "Missing source.",
        estimatedTier: "small",
        verified: true
      })
    ).toBe(false);
  });

  it("allows verified source-backed seeds in real mode matching", async () => {
    const matches = await findSeedCandidatesByGenreAndTarget(
      ["punk rock"],
      "Paris",
      "Paris",
      [
        {
          name: "Verified Paris Punk Trio",
          genres: ["punk rock"],
          city: "Paris",
          country: "France",
          url: null,
          source: "manual_seed",
          notes: "Real seed.",
          estimatedTier: "small",
          verified: true,
          sourceUrl: "https://example.com/verified-seed"
        }
      ],
      { mode: "real" }
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe("Verified Paris Punk Trio");
  });
});
