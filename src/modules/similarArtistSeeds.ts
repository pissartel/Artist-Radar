import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ArtistTier } from "../schemas.js";
import { debugLog } from "../utils/logger.js";

export type SeedDiscoveryMode = "mock" | "real";

export interface SimilarArtistSeedRecord {
  name: string;
  genres: string[];
  city: string | null;
  country: string | null;
  url: string | null;
  source: string;
  notes: string;
  estimatedTier: ArtistTier | null;
  mockOnly?: boolean;
  verified?: boolean;
  sourceNotes?: string | null;
  sourceUrl?: string | null;
  spotifyUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
}

export interface SeedMatchCandidate extends SimilarArtistSeedRecord {
  matchedGenres: string[];
  matchedQuery: string | null;
  genreMatchScore: number;
  sceneMatchScore: number;
  sourceConfidence: number;
}

const GENRE_SYNONYMS: Record<string, string[]> = {
  "hip hop": ["rap"],
  rap: ["hip hop"],
  electronic: ["electro"],
  electro: ["electronic"],
  metal: ["heavy metal"],
  "heavy metal": ["metal"],
  punk: ["punk rock"],
  "punk rock": ["punk"],
  indie: ["indie rock"],
  "indie rock": ["indie"],
  pop: ["pop rock"],
  "pop rock": ["pop"]
};

export interface SeedLoadOptions {
  mode?: SeedDiscoveryMode;
}

export function validateSeedCandidateForRealMode(seed: SimilarArtistSeedRecord): boolean {
  if (seed.mockOnly) {
    return false;
  }

  if (seed.verified !== true) {
    return false;
  }

  if (!hasCredibleSeedSource(seed)) {
    return false;
  }

  if (isPlaceholderSeedName(seed.name)) {
    return false;
  }

  return true;
}

export async function loadSeedCandidates(
  seedRoot = path.join(process.cwd(), "data", "seeds"),
  options: SeedLoadOptions = {}
): Promise<SimilarArtistSeedRecord[]> {
  const files = await listJsonFiles(seedRoot);
  const seeds: SimilarArtistSeedRecord[] = [];

  for (const file of files) {
    const contents = await readFile(file, "utf8");
    const parsed = JSON.parse(contents) as Array<Partial<SimilarArtistSeedRecord>>;
    for (const entry of parsed) {
      if (!entry?.name) {
        continue;
      }

      seeds.push({
        name: entry.name,
        genres: normalizeStrings(entry.genres ?? []),
        city: normalizeNullableString(entry.city),
        country: normalizeNullableString(entry.country),
        url: normalizeNullableString(entry.url),
        source: normalizeString(entry.source ?? "seed"),
        notes: normalizeString(entry.notes ?? ""),
        estimatedTier: normalizeEstimatedTier(entry.estimatedTier),
        mockOnly: normalizeNullableBoolean(entry.mockOnly) ?? undefined,
        verified: normalizeNullableBoolean(entry.verified) ?? undefined,
        sourceNotes: normalizeNullableString(entry.sourceNotes),
        sourceUrl: normalizeNullableString(entry.sourceUrl),
        spotifyUrl: normalizeNullableString(entry.spotifyUrl),
        instagramUrl: normalizeNullableString(entry.instagramUrl),
        youtubeUrl: normalizeNullableString(entry.youtubeUrl)
      });
    }
  }

  debugLog("seeds", "loaded seed files", {
    filesCount: files.length,
    candidatesCount: seeds.length
  });

  if (options.mode === "real") {
    return seeds.filter(validateSeedCandidateForRealMode);
  }

  return seeds;
}

export async function findSeedCandidatesByGenreAndTarget(
  userGenres: string[],
  target: string | null | undefined,
  city: string | null | undefined,
  seeds?: Promise<SimilarArtistSeedRecord[]> | SimilarArtistSeedRecord[],
  options: SeedLoadOptions = {}
): Promise<SeedMatchCandidate[]> {
  const seedList = await (seeds ?? loadSeedCandidates(undefined, options));
  const activeSeeds = options.mode === "real" ? seedList.filter(validateSeedCandidateForRealMode) : seedList;
  const normalizedUserGenres = expandGenres(userGenres);
  const normalizedTarget = normalizeString(target ?? "");
  const normalizedCity = normalizeString(city ?? "");

  const scored = activeSeeds
    .map((seed) => {
      const genreMatch = scoreGenreMatch(normalizedUserGenres, seed.genres, seed.name, normalizedTarget);
      const sceneMatch = scoreSceneMatch(seed, normalizedTarget, normalizedCity);
      const matchedGenres = seed.genres.filter((genre) => normalizedUserGenres.expanded.has(normalizeString(genre)));
      const sourceConfidence = clampScore(
        Math.round(genreMatch * 0.45 + sceneMatch * 0.45 + (seed.estimatedTier ? 10 : 0))
      ) / 100;

      return {
        ...seed,
        matchedGenres,
        matchedQuery: matchedGenres[0] ?? null,
        genreMatchScore: genreMatch,
        sceneMatchScore: sceneMatch,
        sourceConfidence
      };
    })
    .filter((seed) => seed.genreMatchScore >= 35 || seed.sceneMatchScore >= 70)
    .sort((left, right) => {
      const leftScore = left.genreMatchScore * 0.55 + left.sceneMatchScore * 0.45 + left.sourceConfidence * 10;
      const rightScore = right.genreMatchScore * 0.55 + right.sceneMatchScore * 0.45 + right.sourceConfidence * 10;
      return rightScore - leftScore;
    });

  debugLog("seeds", "matching candidates", {
    genres: normalizedUserGenres.exact.size > 0 ? [...normalizedUserGenres.exact] : [],
    city,
    target,
    matchedCount: scored.length
  });

  return scored;
}

function scoreGenreMatch(
  userGenres: ReturnType<typeof expandGenres>,
  candidateGenres: string[],
  candidateName: string,
  target: string
): number {
  const normalizedCandidateGenres = normalizeStrings(candidateGenres);
  const candidate = expandGenres(normalizedCandidateGenres);
  const normalizedCandidateName = normalizeString(candidateName);

  if (userGenres.exact.size === 0) {
    return 20;
  }

  if (candidate.exact.size > 0 && hasIntersection(userGenres.exact, candidate.exact)) {
    return 95;
  }

  if (hasIntersection(userGenres.expanded, candidate.expanded)) {
    return 85;
  }

  if (hasIntersection(userGenres.tokens, candidate.tokens)) {
    return 60;
  }

  if (candidate.exact.size === 0 && target && isFocusedQueryMatch(target, userGenres)) {
    return 45;
  }

  if (normalizedCandidateName && [...userGenres.tokens].some((token) => token.length >= 4 && normalizedCandidateName.includes(token))) {
    return 35;
  }

  return 15;
}

function scoreSceneMatch(seed: SimilarArtistSeedRecord, target: string, city: string): number {
  const seedCity = normalizeString(seed.city ?? "");
  const seedCountry = normalizeString(seed.country ?? "");

  if (city && seedCity && city === seedCity) {
    return 95;
  }

  if (target && ((seedCountry && target.includes(seedCountry)) || (seedCity && target.includes(seedCity)))) {
    return 85;
  }

  if (target && seedCountry && target.includes(seedCountry)) {
    return 75;
  }

  if (!seedCity && !seedCountry) {
    return 45;
  }

  return 65;
}

function hasCredibleSeedSource(seed: SimilarArtistSeedRecord): boolean {
  return Boolean(seed.url ?? seed.sourceUrl ?? seed.spotifyUrl ?? seed.instagramUrl ?? seed.youtubeUrl);
}

function isPlaceholderSeedName(name: string): boolean {
  const normalized = normalizeString(name);
  if (!normalized) {
    return true;
  }

  if (/\b(example|test|artist)\b/.test(normalized)) {
    return true;
  }

  if (/\bband\b/.test(normalized) && normalized.split(" ").length >= 3) {
    return true;
  }

  return false;
}

function expandGenres(genres: string[]): { exact: Set<string>; expanded: Set<string>; tokens: Set<string> } {
  const exact = new Set<string>();
  const expanded = new Set<string>();
  const tokens = new Set<string>();

  for (const genre of genres) {
    const normalized = normalizeString(genre);
    if (!normalized) {
      continue;
    }

    exact.add(normalized);
    expanded.add(normalized);
    for (const synonym of GENRE_SYNONYMS[normalized] ?? []) {
      expanded.add(normalizeString(synonym));
    }
    for (const token of normalized.split(" ").filter(Boolean)) {
      tokens.add(token);
    }
  }

  return { exact, expanded, tokens };
}

function hasIntersection(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

function isFocusedQueryMatch(target: string, userGenres: ReturnType<typeof expandGenres>): boolean {
  return [...userGenres.exact].some((genre) => target.includes(genre));
}

function normalizeStrings(values: Array<string | null | undefined>): string[] {
  return values.map((value) => normalizeString(value ?? "")).filter(Boolean);
}

function normalizeString(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeNullableBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  return null;
}

function normalizeEstimatedTier(value: unknown): ArtistTier | null {
  if (value === "small" || value === "medium" || value === "large" || value === "unknown") {
    return value;
  }
  return null;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

async function listJsonFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listJsonFiles(entryPath)));
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(entryPath);
      }
    }
    return files;
  } catch {
    return [];
  }
}
