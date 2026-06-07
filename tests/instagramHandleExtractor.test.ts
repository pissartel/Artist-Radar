import { describe, expect, it } from "vitest";
import {
  InstagramHandleExtractor,
  extractInstagramHandles,
  normalizeInstagramHandle
} from "../src/modules/instagramHandleExtractor.js";

describe("InstagramHandleExtractor", () => {
  it("extracts instagram.com/tuesdayfall from plain text", () => {
    const results = extractInstagramHandles({
      content: "Lineup announcement: instagram.com/tuesdayfall",
      sourceUrl: "https://venue.example/events/tuesdayfall"
    });

    expect(results).toEqual([
      {
        handle: "tuesdayfall",
        url: "https://www.instagram.com/tuesdayfall/",
        sourceUrl: "https://venue.example/events/tuesdayfall",
        confidence: 0.9
      }
    ]);
  });

  it("extracts full Instagram profile URLs from HTML", () => {
    const extractor = new InstagramHandleExtractor();
    const results = extractor.extract({
      content: '<a href="https://www.instagram.com/tuesdayfall/">Instagram</a>',
      sourceUrl: "https://blog.example/interview"
    });

    expect(results[0]).toMatchObject({
      handle: "tuesdayfall",
      url: "https://www.instagram.com/tuesdayfall/",
      sourceUrl: "https://blog.example/interview"
    });
  });

  it("ignores generic Instagram paths", () => {
    const results = extractInstagramHandles({
      content: [
        "https://www.instagram.com/p/abc123",
        "https://instagram.com/reel/abc123",
        "https://instagram.com/stories/tuesdayfall/123",
        "https://instagram.com/explore/tags/punk"
      ].join(" "),
      sourceUrl: "https://agenda.example"
    });

    expect(results).toEqual([]);
  });

  it("normalizes handles", () => {
    expect(normalizeInstagramHandle("Tuesday.Fall_")).toBe("tuesday.fall_");

    const results = extractInstagramHandles({
      content: "https://www.instagram.com/Tuesday.Fall_/?igsh=abc",
      sourceUrl: "https://collective.example"
    });

    expect(results[0]?.handle).toBe("tuesday.fall_");
    expect(results[0]?.url).toBe("https://www.instagram.com/tuesday.fall_/");
  });

  it("deduplicates handles", () => {
    const results = extractInstagramHandles({
      content: "instagram.com/tuesdayfall https://www.instagram.com/TuesdayFall/ instagram.com/other_band",
      sourceUrl: "https://venue.example"
    });

    expect(results.map((result) => result.handle)).toEqual(["tuesdayfall", "other_band"]);
  });

  it("returns sourceUrl and confidence", () => {
    const results = extractInstagramHandles({
      content: "https://www.instagram.com/tuesdayfall/",
      sourceUrl: "https://local-blog.example/show-review"
    });

    expect(results[0]?.sourceUrl).toBe("https://local-blog.example/show-review");
    expect(results[0]?.confidence).toBeGreaterThan(0);
    expect(results[0]?.confidence).toBeLessThanOrEqual(1);
  });
});
