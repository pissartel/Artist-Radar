import { debugLog } from "../utils/logger.js";

export type GenreCompatibilityLevel = "strong" | "medium" | "weak" | "reject";

export const LEVEL_RANK: Record<GenreCompatibilityLevel, number> = {
  reject: 0,
  weak: 1,
  medium: 2,
  strong: 3
};

export const LEVEL_SCORE: Record<GenreCompatibilityLevel, number> = {
  reject: 5,
  weak: 40,
  medium: 70,
  strong: 95
};

export interface ConditionalGenreRule {
  /** Genre labels this rule applies to when found among declared or mentioned genres. */
  genres: string[];
  /** Any of these keywords present in declared genres or free text unlocks levelWithEvidence. */
  evidenceKeywords: string[];
  levelWithEvidence: GenreCompatibilityLevel;
  levelWithoutEvidence: GenreCompatibilityLevel;
  description: string;
}

export interface GenreRuleSet {
  genre: string;
  aliases: string[];
  strong: string[];
  medium: string[];
  weak: string[];
  reject: string[];
  conditional: ConditionalGenreRule[];
  /** True when this rule set was created dynamically because no explicit rules exist for the genre. */
  isGenericFallback?: boolean;
}

/**
 * Genre rules are data, not prompt text, so they can be reused deterministically
 * across booking, similar artists, and future promotion scoring. Add new genres
 * here rather than hardcoding compatibility logic per feature.
 */
export const GENRE_RULE_SETS: Record<string, GenreRuleSet> = {
  "pop punk": {
    genre: "pop punk",
    aliases: ["pop-punk", "poppunk"],
    strong: ["pop punk", "punk rock", "emo pop", "easycore", "skate punk", "melodic punk"],
    medium: ["emo", "post-hardcore melodic", "melodic post-hardcore"],
    weak: ["rock", "pop rock"],
    reject: ["pop", "chanson", "rap", "electronic"],
    conditional: [
      {
        genres: ["alternative rock"],
        evidenceKeywords: ["punk", "emo", "pop punk", "hardcore", "post-hardcore"],
        levelWithEvidence: "medium",
        levelWithoutEvidence: "weak",
        description: "alternative rock requires additional punk/emo/pop-punk evidence to reach medium compatibility"
      },
      {
        genres: ["power pop"],
        evidenceKeywords: ["punk", "pop punk", "emo"],
        levelWithEvidence: "medium",
        levelWithoutEvidence: "weak",
        description: "power pop requires additional punk evidence to reach medium compatibility"
      },
      {
        genres: ["extreme metal", "death metal", "black metal", "metalcore", "deathcore"],
        evidenceKeywords: ["punk scene", "emo scene", "hardcore scene", "pop punk scene", "diy scene"],
        levelWithEvidence: "weak",
        levelWithoutEvidence: "reject",
        description: "extreme metal is rejected unless strong local scene evidence connects it to the punk/emo scene"
      }
    ]
  }
};

/**
 * Looks up the explicit rule set for a genre, falling back to a generic rule set when
 * none is configured yet. This keeps compatibility scoring safe for any user-entered
 * genre instead of returning null. Adding a genre to GENRE_RULE_SETS always takes
 * priority over the fallback.
 */
export function findGenreRuleSet(genre: string): GenreRuleSet {
  const normalized = normalizeGenreLabel(genre);

  for (const ruleSet of Object.values(GENRE_RULE_SETS)) {
    if (ruleSet.genre === normalized || ruleSet.aliases.includes(normalized)) {
      return ruleSet;
    }
  }

  debugLog("genre", `No explicit genre rule set for "${normalized}"; using generic fallback.`, {
    genre: normalized,
    usedGenericFallback: true
  });
  return createGenericGenreRuleSet(normalized);
}

/**
 * A safe default for genres without dedicated rules: only an exact match on the
 * genre itself counts as strong, and no related/medium/weak genres are guessed.
 */
export function createGenericGenreRuleSet(genre: string): GenreRuleSet {
  return {
    genre,
    aliases: [],
    strong: [genre],
    medium: [],
    weak: [],
    reject: [],
    conditional: [],
    isGenericFallback: true
  };
}

export function normalizeGenreLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
