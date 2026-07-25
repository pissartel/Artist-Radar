import { describe, expect, it } from "vitest";
import { computeLiveMusicEntityMatchKeys, mergeLiveMusicEntityCandidates } from "../../../src/sources/liveMusicEntities/entityResolution.js";
import type { LiveMusicEntityCandidate } from "../../../src/sources/liveMusicEntities/types.js";

function candidate(overrides: Partial<LiveMusicEntityCandidate>): LiveMusicEntityCandidate {
  return {
    externalIds: { source: "1" },
    name: "Le Krakatoa",
    entityType: "concert_venue",
    city: "Mérignac",
    sourceRecords: [
      {
        sourceType: "web_discovery",
        sourceName: "Web discovery",
        sourceUrl: "https://krakatoa.org",
        retrievedAt: "2026-07-01T00:00:00.000Z",
        reliabilityScore: 0.5
      }
    ],
    activityEvidence: [],
    ...overrides
  };
}

describe("computeLiveMusicEntityMatchKeys", () => {
  it("normalizes name+city, ignoring case, accents and leading articles", () => {
    const a = computeLiveMusicEntityMatchKeys(candidate({ name: "Le Krakatoa", city: "Mérignac" }));
    const b = computeLiveMusicEntityMatchKeys(candidate({ name: "KRAKATOA", city: "merignac" }));
    expect(a.some((key) => b.includes(key))).toBe(true);
  });

  it("includes a website-hostname key when a website is present", () => {
    const keys = computeLiveMusicEntityMatchKeys(candidate({ websiteUrl: "https://www.krakatoa.org/programme" }));
    expect(keys).toContain("host:krakatoa.org");
  });

  it("includes a phone key normalized to digits and leading +", () => {
    const keys = computeLiveMusicEntityMatchKeys(candidate({ phone: "+33 5 56 24 12 33" }));
    expect(keys).toContain("phone:+33556241233");
  });
});

describe("mergeLiveMusicEntityCandidates", () => {
  it("merges two candidates from different sources sharing a website hostname", () => {
    const fromOsm = candidate({
      externalIds: { osm: "node/1" },
      websiteUrl: "https://krakatoa.org",
      sourceRecords: [
        {
          sourceType: "overpass_osm",
          sourceName: "OpenStreetMap (Overpass)",
          sourceUrl: "https://www.openstreetmap.org/node/1",
          retrievedAt: "2026-07-01T00:00:00.000Z",
          reliabilityScore: 0.4
        }
      ]
    });
    const fromWeb = candidate({
      externalIds: { web: "abc" },
      websiteUrl: "https://www.krakatoa.org",
      sourceRecords: [
        {
          sourceType: "web_discovery",
          sourceName: "Web discovery",
          sourceUrl: "https://krakatoa.org/programme",
          retrievedAt: "2026-07-02T00:00:00.000Z",
          reliabilityScore: 0.6
        }
      ],
      activityEvidence: [
        {
          kind: "current_programme_page",
          description: "Programme page lists upcoming shows.",
          sourceUrl: "https://krakatoa.org/programme",
          observedAt: null,
          collectedAt: "2026-07-02T00:00:00.000Z",
          confidence: 0.7
        }
      ]
    });

    const merged = mergeLiveMusicEntityCandidates([fromOsm, fromWeb]);
    expect(merged).toHaveLength(1);
    expect(merged[0].externalIds).toEqual({ osm: "node/1", web: "abc" });
    expect(merged[0].sourceRecords).toHaveLength(2);
    expect(merged[0].activityEvidence).toHaveLength(1);
  });

  it("keeps unrelated candidates separate", () => {
    const a = candidate({ name: "Le Krakatoa", city: "Mérignac", websiteUrl: "https://krakatoa.org" });
    const b = candidate({ name: "La Rock School Barbey", city: "Bordeaux", websiteUrl: "https://rockschool-barbey.com" });

    const merged = mergeLiveMusicEntityCandidates([a, b]);
    expect(merged).toHaveLength(2);
  });

  it("transitively merges three candidates linked pairwise by different keys", () => {
    const a = candidate({ externalIds: { a: "1" }, name: "Le Krakatoa", city: "Mérignac", websiteUrl: "https://krakatoa.org", phone: undefined });
    const b = candidate({ externalIds: { b: "2" }, name: "Krakatoa", city: "Mérignac", websiteUrl: undefined, phone: "+33556241233" });
    const c = candidate({ externalIds: { c: "3" }, name: "Salle Krakatoa Mérignac", city: "Mérignac", websiteUrl: undefined, phone: "+33556241233" });

    const merged = mergeLiveMusicEntityCandidates([a, b, c]);
    expect(merged).toHaveLength(1);
    expect(merged[0].externalIds).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("merges candidates whose coordinates are within the proximity threshold", () => {
    const a = candidate({ externalIds: { a: "1" }, name: "Krakatoa", latitude: 44.8422, longitude: -0.6514, websiteUrl: undefined });
    const b = candidate({ externalIds: { b: "2" }, name: "Le Krakatoa Officiel", latitude: 44.8423, longitude: -0.6515, websiteUrl: undefined });

    const merged = mergeLiveMusicEntityCandidates([a, b]);
    expect(merged).toHaveLength(1);
  });
});
