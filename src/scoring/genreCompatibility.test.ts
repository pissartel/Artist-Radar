import { describe, expect, it } from "vitest";
import { scoreGenreCompatibility } from "./genreCompatibility.js";

describe("scoreGenreCompatibility - pop punk", () => {
  it("is strong for a declared pop punk genre", () => {
    const result = scoreGenreCompatibility("pop punk", { declaredGenres: ["pop punk"] });
    expect(result.level).toBe("strong");
    expect(result.matchedGenres).toContain("pop punk");
  });

  it("is strong for other core pop punk family genres (punk rock, emo pop, easycore, skate punk, melodic punk)", () => {
    for (const genre of ["punk rock", "emo pop", "easycore", "skate punk", "melodic punk"]) {
      const result = scoreGenreCompatibility("pop punk", { declaredGenres: [genre] });
      expect(result.level, `expected ${genre} to be strong`).toBe("strong");
    }
  });

  it("is strong when the evidence only comes from free text signals, not declared genres", () => {
    const result = scoreGenreCompatibility("pop punk", {
      declaredGenres: ["pop"],
      bio: "A high-energy skate punk band from the local DIY scene."
    });
    expect(result.level).toBe("strong");
    expect(result.matchedGenres).toContain("skate punk");
  });

  it("is medium for emo", () => {
    const result = scoreGenreCompatibility("pop punk", { declaredGenres: ["emo"] });
    expect(result.level).toBe("medium");
  });

  it("accepts alternative rock as medium only with additional punk/emo evidence", () => {
    const withoutEvidence = scoreGenreCompatibility("pop punk", { declaredGenres: ["alternative rock"] });
    expect(withoutEvidence.level).toBe("weak");

    const withEvidence = scoreGenreCompatibility("pop punk", {
      declaredGenres: ["alternative rock"],
      bio: "Rooted in raw punk energy."
    });
    expect(withEvidence.level).toBe("medium");
  });

  it("is weak for alternative rock, rock, or pop rock alone", () => {
    for (const genre of ["alternative rock", "rock", "pop rock"]) {
      const result = scoreGenreCompatibility("pop punk", { declaredGenres: [genre] });
      expect(result.level, `expected ${genre} to be weak`).toBe("weak");
    }
  });

  it("rejects generic pop, chanson, rap, and electronic", () => {
    for (const genre of ["pop", "chanson", "rap", "electronic"]) {
      const result = scoreGenreCompatibility("pop punk", { declaredGenres: [genre] });
      expect(result.level, `expected ${genre} to be reject`).toBe("reject");
    }
  });

  it("provides debug rejection reasons when rejecting", () => {
    const result = scoreGenreCompatibility("pop punk", { declaredGenres: ["chanson"] });
    expect(result.level).toBe("reject");
    expect(result.debug.rejectionReasons.length).toBeGreaterThan(0);
  });

  it("rejects extreme metal genres unless strong scene evidence exists", () => {
    const withoutEvidence = scoreGenreCompatibility("pop punk", { declaredGenres: ["death metal"] });
    expect(withoutEvidence.level).toBe("reject");

    const withEvidence = scoreGenreCompatibility("pop punk", {
      declaredGenres: ["death metal"],
      venueProgrammingText: "Regularly books the local hardcore scene alongside metal acts."
    });
    expect(withEvidence.level).toBe("weak");
  });

  it("does not reject solely because one metadata field is generic when other evidence is strong", () => {
    const result = scoreGenreCompatibility("pop punk", {
      declaredGenres: ["pop"],
      eventLineupText: "Co-headlining with a well-known pop punk band.",
      playlists: ["Best of Pop Punk 2024"]
    });
    expect(result.level).toBe("strong");
  });

  it("is deterministic across repeated calls with identical input", () => {
    const signals = { declaredGenres: ["emo"], bio: "melodic post-hardcore influences" };
    const first = scoreGenreCompatibility("pop punk", signals);
    const second = scoreGenreCompatibility("pop punk", signals);
    expect(second).toEqual(first);
  });

  it("rejects when no genre evidence at all is provided", () => {
    const result = scoreGenreCompatibility("pop punk", {});
    expect(result.level).toBe("reject");
  });

  it("uses the explicit rule set rather than the generic fallback", () => {
    const result = scoreGenreCompatibility("pop punk", { declaredGenres: ["pop punk"] });
    expect(result.debug.usedGenericFallback).toBe(false);
  });
});

describe("scoreGenreCompatibility - generic fallback for unknown genres", () => {
  const unknownGenres = ["shoegaze", "hyperpop", "deathcore", "folk punk", "bedroom pop"];

  it.each(unknownGenres)("treats an exact declared match for %s as strong", (genre) => {
    const result = scoreGenreCompatibility(genre, { declaredGenres: [genre] });
    expect(result.level).toBe("strong");
    expect(result.matchedGenres).toContain(genre);
  });

  it.each(unknownGenres)("flags usedGenericFallback for %s", (genre) => {
    const result = scoreGenreCompatibility(genre, { declaredGenres: [genre] });
    expect(result.debug.usedGenericFallback).toBe(true);
  });

  it("does not guess that an unrelated genre is compatible with an unknown target genre", () => {
    const result = scoreGenreCompatibility("shoegaze", { declaredGenres: ["dream pop"] });
    expect(result.level).toBe("reject");
    expect(result.debug.usedGenericFallback).toBe(true);
  });

  it("rejects with an explanatory reason when relying on the generic fallback", () => {
    const result = scoreGenreCompatibility("jazz", { declaredGenres: ["bebop"] });
    expect(result.level).toBe("reject");
    expect(result.debug.usedGenericFallback).toBe(true);
    expect(result.debug.rejectionReasons.some((reason) => /no explicit genre rules/i.test(reason))).toBe(true);
  });

  it("rejects when no genre evidence at all is provided for an unknown genre", () => {
    const result = scoreGenreCompatibility("hyperpop", {});
    expect(result.level).toBe("reject");
    expect(result.debug.usedGenericFallback).toBe(true);
  });
});
