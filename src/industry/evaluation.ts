import { normalizeIndustryName } from "./normalization.js";

export function recallAtK(rankedNames: string[], relevantNames: string[], k: number): number {
  if (!relevantNames.length) return 0;
  const ranked = new Set(rankedNames.slice(0, k).map(normalizeIndustryName));
  const relevant = new Set(relevantNames.map(normalizeIndustryName));
  return [...relevant].filter((name) => ranked.has(name)).length / relevant.size;
}

export function industryEvaluationMetrics(rankedNames: string[], relevantNames: string[]) {
  return { recallAt10: recallAtK(rankedNames, relevantNames, 10), recallAt20: recallAtK(rankedNames, relevantNames, 20) };
}
