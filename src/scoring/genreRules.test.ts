import { describe, expect, it } from "vitest";
import { createGenericGenreRuleSet, findGenreRuleSet } from "./genreRules.js";

describe("findGenreRuleSet", () => {
  it("returns the explicit pop punk rule set for pop punk and its aliases", () => {
    for (const genre of ["pop punk", "pop-punk", "poppunk"]) {
      const ruleSet = findGenreRuleSet(genre);
      expect(ruleSet.genre).toBe("pop punk");
      expect(ruleSet.isGenericFallback).toBeUndefined();
    }
  });

  it.each(["shoegaze", "hyperpop", "deathcore", "folk punk", "bedroom pop"])(
    "returns a generic fallback rule set for %s instead of null",
    (genre) => {
      const ruleSet = findGenreRuleSet(genre);
      expect(ruleSet).not.toBeNull();
      expect(ruleSet.genre).toBe(genre);
      expect(ruleSet.isGenericFallback).toBe(true);
    }
  );

  it("normalizes genre labels before matching", () => {
    const ruleSet = findGenreRuleSet("  Pop   Punk  ");
    expect(ruleSet.genre).toBe("pop punk");
    expect(ruleSet.isGenericFallback).toBeUndefined();
  });
});

describe("createGenericGenreRuleSet", () => {
  it("only treats the exact genre as strong and makes no other assumptions", () => {
    const ruleSet = createGenericGenreRuleSet("shoegaze");
    expect(ruleSet).toEqual({
      genre: "shoegaze",
      aliases: [],
      strong: ["shoegaze"],
      medium: [],
      weak: [],
      reject: [],
      conditional: [],
      isGenericFallback: true
    });
  });
});
