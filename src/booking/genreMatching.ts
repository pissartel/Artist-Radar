const GENRE_RELATIONS: Record<string, string[]> = {
  "pop punk": ["pop punk", "punk rock", "punk", "emo", "emo pop", "easycore", "skate punk", "melodic punk"],
  metal: ["metal", "heavy metal", "metalcore", "death metal", "black metal", "hardcore"],
  "indie rock": ["indie rock", "alternative rock", "garage rock", "post-punk", "shoegaze"],
  "hip hop": ["rap", "hip hop", "trap", "drill", "boom bap"],
  electronic: ["electro", "house", "techno", "bass music", "synthwave"],
  chanson: ["chanson", "chanson française", "folk", "pop française", "acoustic"]
};

const GENERIC_GENRES = new Set(["rock", "pop", "alternative", "indie", "punk", "metal", "electronic", "folk", "acoustic"]);

export type BookingGenreMatchLevel = "exact" | "related" | "generic" | "incompatible" | "unknown";

export interface BookingGenreMatch {
  level: BookingGenreMatchLevel;
  score: number;
  matchedGenres: string[];
  incompatibleGenres: string[];
}

export function getRelatedGenres(userGenres: string[]): string[] {
  const normalized = normalizeGenres(userGenres);
  const related = new Set<string>();

  for (const genre of normalized) {
    related.add(genre);
    for (const [baseGenre, family] of Object.entries(GENRE_RELATIONS)) {
      if (genre === baseGenre || family.includes(genre)) {
        family.forEach((entry) => related.add(entry));
      }
    }
  }

  return [...related];
}

export function matchBookingGenres(userGenres: string[], targetGenres: string[], text = ""): BookingGenreMatch {
  const user = normalizeGenres(userGenres);
  const target = normalizeGenres(targetGenres);
  const textGenres = inferGenresFromText(text);
  const candidate = uniqueStrings([...target, ...textGenres]);

  if (candidate.length === 0) {
    return { level: "unknown", score: 25, matchedGenres: [], incompatibleGenres: [] };
  }

  const exact = candidate.filter((genre) => user.includes(genre));
  if (exact.length > 0) {
    return { level: "exact", score: 95, matchedGenres: exact, incompatibleGenres: [] };
  }

  const related = getRelatedGenres(user);
  const relatedMatches = candidate.filter((genre) => related.includes(genre));
  if (relatedMatches.length > 0) {
    return { level: "related", score: 75, matchedGenres: relatedMatches, incompatibleGenres: [] };
  }

  if (isAlternativeRockWithPunkEvidence(user, candidate, text)) {
    return { level: "related", score: 70, matchedGenres: ["alternative rock"], incompatibleGenres: [] };
  }

  const genericMatches = candidate.filter((genre) => GENERIC_GENRES.has(genre));
  if (genericMatches.length > 0) {
    return { level: "generic", score: 45, matchedGenres: genericMatches, incompatibleGenres: [] };
  }

  return { level: "incompatible", score: 5, matchedGenres: [], incompatibleGenres: candidate };
}

function isAlternativeRockWithPunkEvidence(userGenres: string[], targetGenres: string[], text: string): boolean {
  const userRelated = getRelatedGenres(userGenres);
  const hasAlternativeRock = targetGenres.includes("alternative rock");
  const hasPunkEvidence = /\b(pop punk|punk rock|punk|emo|easycore)\b/i.test(text) || targetGenres.some((genre) => userRelated.includes(genre));
  return hasAlternativeRock && hasPunkEvidence;
}

function inferGenresFromText(text: string): string[] {
  const normalized = normalizeText(text);
  const knownGenres = uniqueStrings(Object.values(GENRE_RELATIONS).flat());
  return knownGenres.filter((genre) => new RegExp(`\\b${escapeRegExp(genre)}\\b`).test(normalized));
}

function normalizeGenres(genres: string[]): string[] {
  return uniqueStrings(genres.map(normalizeText).filter(Boolean));
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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
