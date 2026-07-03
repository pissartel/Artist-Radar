import {
  findGenreRuleSet,
  LEVEL_SCORE,
  normalizeGenreLabel,
  type ConditionalGenreRule,
  type GenreCompatibilityLevel,
  type GenreRuleSet
} from "./genreRules.js";

/**
 * Multiple signals so a single generic metadata field (e.g. a bio tagged just "pop")
 * never rejects an artist when stronger evidence exists elsewhere (bio, lineup, playlists...).
 */
export interface GenreSignals {
  declaredGenres?: string[];
  bio?: string;
  eventLineupText?: string;
  playlists?: string[];
  venueProgrammingText?: string;
  sourceText?: string;
}

export interface GenreCompatibilityResult {
  level: GenreCompatibilityLevel;
  score: number;
  matchedGenres: string[];
  explanation: string;
  debug: {
    targetGenre: string;
    consideredGenres: string[];
    rejectionReasons: string[];
    usedGenericFallback: boolean;
  };
}

interface ConditionalMatch {
  rule: ConditionalGenreRule;
  matchedGenre: string;
  level: GenreCompatibilityLevel;
  hasEvidence: boolean;
}

export function scoreGenreCompatibility(targetGenre: string, signals: GenreSignals = {}): GenreCompatibilityResult {
  const ruleSet = findGenreRuleSet(targetGenre);
  const declared = normalizeList(signals.declaredGenres ?? []);
  const text = normalizeText(buildSignalText(signals));

  const mentionedGenres = findMentionedGenres(ruleSet, text);
  const consideredGenres = uniqueStrings([...declared, ...mentionedGenres]);
  const conditionalMatches = ruleSet.conditional
    .map((rule) => evaluateConditionalRule(rule, consideredGenres, declared, text))
    .filter((match): match is ConditionalMatch => match !== null);

  const strongMatches = consideredGenres.filter((genre) => ruleSet.strong.includes(genre));
  if (strongMatches.length > 0) {
    return buildResult("strong", strongMatches, ruleSet, targetGenre, consideredGenres, []);
  }

  const mediumMatches = uniqueStrings([
    ...consideredGenres.filter((genre) => ruleSet.medium.includes(genre)),
    ...conditionalMatches.filter((match) => match.level === "medium").map((match) => match.matchedGenre)
  ]);
  if (mediumMatches.length > 0) {
    return buildResult("medium", mediumMatches, ruleSet, targetGenre, consideredGenres, []);
  }

  const weakMatches = uniqueStrings([
    ...consideredGenres.filter((genre) => ruleSet.weak.includes(genre)),
    ...conditionalMatches.filter((match) => match.level === "weak").map((match) => match.matchedGenre)
  ]);
  if (weakMatches.length > 0) {
    return buildResult("weak", weakMatches, ruleSet, targetGenre, consideredGenres, []);
  }

  const rejectMatches = uniqueStrings([
    ...consideredGenres.filter((genre) => ruleSet.reject.includes(genre)),
    ...conditionalMatches.filter((match) => match.level === "reject").map((match) => match.matchedGenre)
  ]);
  const rejectionReasons = buildRejectionReasons(ruleSet, targetGenre, rejectMatches, conditionalMatches, consideredGenres);
  return buildResult("reject", rejectMatches, ruleSet, targetGenre, consideredGenres, rejectionReasons);
}

function evaluateConditionalRule(
  rule: ConditionalGenreRule,
  consideredGenres: string[],
  declared: string[],
  text: string
): ConditionalMatch | null {
  const matchedGenre = rule.genres.find((genre) => consideredGenres.includes(genre));
  if (!matchedGenre) {
    return null;
  }
  const hasEvidence = rule.evidenceKeywords.some(
    (keyword) => declared.includes(keyword) || containsWord(text, keyword)
  );
  return {
    rule,
    matchedGenre,
    level: hasEvidence ? rule.levelWithEvidence : rule.levelWithoutEvidence,
    hasEvidence
  };
}

function buildRejectionReasons(
  ruleSet: GenreRuleSet,
  targetGenre: string,
  rejectMatches: string[],
  conditionalMatches: ConditionalMatch[],
  consideredGenres: string[]
): string[] {
  const reasons: string[] = [];

  for (const genre of rejectMatches) {
    reasons.push(`"${genre}" is an explicitly incompatible or overly generic genre for "${targetGenre}".`);
  }
  for (const match of conditionalMatches.filter((candidate) => candidate.level === "reject")) {
    reasons.push(`${match.rule.description} (no evidence found: ${match.rule.evidenceKeywords.join(", ")}).`);
  }
  if (reasons.length === 0) {
    reasons.push(
      consideredGenres.length === 0
        ? `No genre evidence at all was found for "${targetGenre}" compatibility.`
        : `None of the considered genres (${consideredGenres.join(", ")}) match any strong, medium, or weak rule for "${targetGenre}".`
    );
  }
  if (ruleSet.isGenericFallback) {
    reasons.push(`"${targetGenre}" has no explicit genre rules configured, so only an exact genre match is treated as compatible.`);
  }
  return reasons;
}

function buildResult(
  level: GenreCompatibilityLevel,
  matchedGenres: string[],
  ruleSet: GenreRuleSet,
  targetGenre: string,
  consideredGenres: string[],
  rejectionReasons: string[]
): GenreCompatibilityResult {
  const explanation = matchedGenres.length > 0
    ? `"${targetGenre}" compatibility is ${level} based on: ${matchedGenres.join(", ")}.`
    : `"${targetGenre}" compatibility is ${level}: ${rejectionReasons[0] ?? "no supporting genre evidence found."}`;

  return {
    level,
    score: LEVEL_SCORE[level],
    matchedGenres,
    explanation,
    debug: {
      targetGenre: ruleSet.genre,
      consideredGenres,
      rejectionReasons,
      usedGenericFallback: ruleSet.isGenericFallback === true
    }
  };
}

function findMentionedGenres(ruleSet: GenreRuleSet, text: string): string[] {
  const vocabulary = uniqueStrings([
    ...ruleSet.strong,
    ...ruleSet.medium,
    ...ruleSet.weak,
    ...ruleSet.reject,
    ...ruleSet.conditional.flatMap((rule) => rule.genres)
  ]).sort((left, right) => right.length - left.length);

  return vocabulary.filter((genre) => containsWord(text, genre));
}

function buildSignalText(signals: GenreSignals): string {
  return [signals.bio, signals.eventLineupText, ...(signals.playlists ?? []), signals.venueProgrammingText, signals.sourceText]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function containsWord(text: string, phrase: string): boolean {
  if (!text || !phrase) {
    return false;
  }
  return new RegExp(`\\b${escapeRegExp(normalizeGenreLabel(phrase))}\\b`).test(text);
}

function normalizeList(values: string[]): string[] {
  return uniqueStrings(values.map(normalizeGenreLabel).filter(Boolean));
}

function normalizeText(value: string): string {
  return normalizeGenreLabel(value);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
