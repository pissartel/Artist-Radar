import { describe, expect, it } from "vitest";
import { LIVE_OPPORTUNITY_ENTITY_TYPES, LiveOpportunityEntityTypeSchema, parseLiveMusicEntityCandidate } from "../../../src/sources/liveMusicEntities/types.js";

describe("LIVE_OPPORTUNITY_ENTITY_TYPES", () => {
  it("uses the Latin ASCII 'mjc', never the visually similar Cyrillic lookalike", () => {
    expect(LIVE_OPPORTUNITY_ENTITY_TYPES).toContain("mjc");
    const mjc = LIVE_OPPORTUNITY_ENTITY_TYPES.find((value) => value.includes("mj"));
    expect(mjc).toBe("mjc");
    expect([...mjc!].every((char) => char.charCodeAt(0) <= 0x7a)).toBe(true);
  });

  it("contains all 15 entity types required by issue #183", () => {
    expect(LIVE_OPPORTUNITY_ENTITY_TYPES).toEqual([
      "concert_venue",
      "smac",
      "bar",
      "pub",
      "cafe_concert",
      "club",
      "cultural_center",
      "mjc",
      "municipal_venue",
      "third_place",
      "association",
      "collective",
      "promoter",
      "festival_organizer",
      "other_live_music_organization"
    ]);
  });

  it("validates every literal through the zod schema", () => {
    for (const entityType of LIVE_OPPORTUNITY_ENTITY_TYPES) {
      expect(() => LiveOpportunityEntityTypeSchema.parse(entityType)).not.toThrow();
    }
  });
});

describe("parseLiveMusicEntityCandidate", () => {
  it("accepts a minimal valid candidate", () => {
    const candidate = parseLiveMusicEntityCandidate({
      externalIds: { osm: "node/1" },
      name: "Le Krakatoa",
      entityType: "concert_venue",
      sourceRecords: [
        {
          sourceType: "web_discovery",
          sourceName: "Web discovery",
          sourceUrl: "https://krakatoa.org",
          retrievedAt: "2026-07-01T00:00:00.000Z",
          reliabilityScore: 0.5
        }
      ],
      activityEvidence: []
    });
    expect(candidate.name).toBe("Le Krakatoa");
  });

  it("rejects a candidate with no external ids record", () => {
    expect(() =>
      parseLiveMusicEntityCandidate({
        name: "Le Krakatoa",
        entityType: "concert_venue",
        sourceRecords: [],
        activityEvidence: []
      })
    ).toThrow();
  });
});
