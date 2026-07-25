import { describe, expect, it } from "vitest";
import {
  classifyLiveMusicEntityTypeFromOsmTags,
  classifyLiveMusicEntityTypeFromText
} from "../../../src/sources/liveMusicEntities/entityTypeMapping.js";

describe("classifyLiveMusicEntityTypeFromText", () => {
  it("classifies a SMAC before falling back to the generic venue pattern", () => {
    expect(classifyLiveMusicEntityTypeFromText("Le Krakatoa est une salle de musiques actuelles (SMAC).")?.entityType).toBe("smac");
  });

  it("classifies a bar, pub, cafe-concert and club distinctly", () => {
    expect(classifyLiveMusicEntityTypeFromText("Ce bar propose des concerts tous les jeudis.")?.entityType).toBe("bar");
    expect(classifyLiveMusicEntityTypeFromText("This pub hosts live bands every weekend.")?.entityType).toBe("pub");
    expect(classifyLiveMusicEntityTypeFromText("Un café-concert au cœur de Bordeaux.")?.entityType).toBe("cafe_concert");
    expect(classifyLiveMusicEntityTypeFromText("Ce club programme des soirées concerts.")?.entityType).toBe("club");
  });

  it("classifies an MJC, cultural center, municipal venue and third place", () => {
    expect(classifyLiveMusicEntityTypeFromText("La MJC organise des concerts.")?.entityType).toBe("mjc");
    expect(classifyLiveMusicEntityTypeFromText("Le centre culturel accueille des groupes locaux.")?.entityType).toBe("cultural_center");
    expect(classifyLiveMusicEntityTypeFromText("La salle municipale programme des concerts.")?.entityType).toBe("municipal_venue");
    expect(classifyLiveMusicEntityTypeFromText("Ce tiers-lieu accueille des concerts.")?.entityType).toBe("third_place");
  });

  it("classifies an association, collective, promoter and festival organizer", () => {
    expect(classifyLiveMusicEntityTypeFromText("Cette association organise des concerts.")?.entityType).toBe("association");
    expect(classifyLiveMusicEntityTypeFromText("Ce collectif organise des concerts.")?.entityType).toBe("collective");
    expect(classifyLiveMusicEntityTypeFromText("Ce promoteur organise des concerts dans la région.")?.entityType).toBe("promoter");
    expect(classifyLiveMusicEntityTypeFromText("Festival organizer booking emerging bands.")?.entityType).toBe("festival_organizer");
  });

  it("returns null when the text has no live-music or structure keyword at all", () => {
    expect(classifyLiveMusicEntityTypeFromText("A quiet bakery downtown.")).toBeNull();
  });

  it("does not classify an ordinary word as a venue without a real keyword match", () => {
    expect(classifyLiveMusicEntityTypeFromText("The weather was nice today.")).toBeNull();
  });
});

describe("classifyLiveMusicEntityTypeFromOsmTags", () => {
  it("maps amenity=music_venue to concert_venue as a geographic seed", () => {
    expect(classifyLiveMusicEntityTypeFromOsmTags({ amenity: "music_venue" })?.entityType).toBe("concert_venue");
  });

  it("maps live_music=yes bars, pubs and cafes to their respective types", () => {
    expect(classifyLiveMusicEntityTypeFromOsmTags({ amenity: "bar", live_music: "yes" })?.entityType).toBe("bar");
    expect(classifyLiveMusicEntityTypeFromOsmTags({ amenity: "pub", live_music: "yes" })?.entityType).toBe("pub");
    expect(classifyLiveMusicEntityTypeFromOsmTags({ amenity: "cafe", live_music: "yes" })?.entityType).toBe("cafe_concert");
  });

  it("maps a nightclub to club only when live_music is confirmed", () => {
    expect(classifyLiveMusicEntityTypeFromOsmTags({ amenity: "nightclub", live_music: "yes" })?.entityType).toBe("club");
  });

  it("never classifies an ordinary bar/pub/cafe as a live-music entity without the live_music tag", () => {
    expect(classifyLiveMusicEntityTypeFromOsmTags({ amenity: "bar" })).toBeNull();
    expect(classifyLiveMusicEntityTypeFromOsmTags({ amenity: "pub" })).toBeNull();
    expect(classifyLiveMusicEntityTypeFromOsmTags({ amenity: "cafe" })).toBeNull();
    expect(classifyLiveMusicEntityTypeFromOsmTags({ amenity: "nightclub" })).toBeNull();
  });

  it("returns null for unrelated amenities", () => {
    expect(classifyLiveMusicEntityTypeFromOsmTags({ amenity: "bakery" })).toBeNull();
  });
});
