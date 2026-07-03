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

export function findGenreRuleSet(genre: string): GenreRuleSet | null {
  const normalized = normalizeGenreLabel(genre);
  for (const ruleSet of Object.values(GENRE_RULE_SETS)) {
    if (ruleSet.genre === normalized || ruleSet.aliases.includes(normalized)) {
      return ruleSet;
    }
  }
  return null;
}

export function normalizeGenreLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
