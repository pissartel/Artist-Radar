export const GENRE_FAMILIES = {
  punk: [
    "pop punk",
    "punk rock",
    "punk",
    "emo",
    "emo pop",
    "easycore",
    "skate punk",
    "melodic punk",
    "post-hardcore",
    "hardcore punk"
  ],
  metal: [
    "metal",
    "metalcore",
    "deathcore",
    "hardcore",
    "heavy metal",
    "post-hardcore",
    "nu metal",
    "black metal",
    "death metal"
  ],
  indie_alt: [
    "indie",
    "indie rock",
    "alternative",
    "alternative rock",
    "garage rock",
    "post-punk",
    "shoegaze"
  ],
  hip_hop: [
    "rap",
    "hip hop",
    "trap",
    "drill",
    "boom bap"
  ],
  electronic: [
    "electronic",
    "electro",
    "techno",
    "house",
    "drum and bass",
    "edm",
    "ambient"
  ],
  pop: [
    "pop",
    "pop rock",
    "synthpop",
    "europop",
    "indie pop"
  ],
  folk: [
    "folk",
    "acoustic",
    "singer-songwriter",
    "americana"
  ]
} as const;

export type GenreFamily = keyof typeof GENRE_FAMILIES;
export type GenreSpecificity = "specific" | "broad";
export type GenreCompatibilityLevel =
  | "compatible"
  | "weak_broad_match"
  | "insufficient_evidence"
  | "explicitly_incompatible"
  | "unknown"
  | "exact"
  | "close"
  | "broad_weak"
  | "incompatible";

export const MUSIC_GENRE_ALIASES: Record<string, string> = {
  "post hardcore": "post-hardcore",
  emopop: "emo pop",
  "pop-punk": "pop punk",
  punkrock: "punk rock",
  hiphop: "hip hop",
  alt: "alternative",
  "alt rock": "alternative rock",
  dnb: "drum and bass",
  edm: "electronic"
};

export const NON_GENRE_TAGS = new Set([
  "singer",
  "songwriter",
  "male vocalists",
  "female vocalists",
  "seen live",
  "favorites",
  "favourite",
  "favorite",
  "under 2000 listeners",
  "under 1000 listeners",
  "unsigned",
  "local",
  "official",
  "band"
]);

export const KNOWN_MUSIC_GENRES = new Set(Object.values(GENRE_FAMILIES).flat());

const BROAD_GENRES = new Set([
  "pop",
  "rock",
  "metal",
  "punk",
  "electronic",
  "alternative",
  "indie",
  "folk",
  "acoustic",
  "rap"
]);

const AMBIGUOUS_INSUFFICIENT_GENRES = new Set([
  "pop",
  "rock",
  "alternative",
  "alternative rock",
  "indie",
  "indie rock",
  "pop rock"
]);

const GENERIC_LOCATION_LANGUAGE_TAGS = new Set([
  "france",
  "french",
  "germany",
  "german",
  "italy",
  "italian",
  "spain",
  "spanish",
  "uk",
  "united kingdom",
  "british",
  "england",
  "english",
  "usa",
  "united states",
  "american",
  "canada",
  "canadian",
  "hungary",
  "hungarian",
  "magyar"
]);

const COUNTRY_LANGUAGE_TAGS: Record<string, string[]> = {
  france: ["france", "french", "français", "francais"],
  germany: ["germany", "german", "deutsch", "deutschland"],
  hungary: ["hungary", "hungarian", "magyar"],
  italy: ["italy", "italian"],
  spain: ["spain", "spanish"],
  "united kingdom": ["united kingdom", "uk", "british", "england", "english"],
  "united states": ["united states", "usa", "us", "american"],
  canada: ["canada", "canadian"]
};

const COUNTRY_CITY_TAGS: Record<string, string[]> = {
  france: ["paris", "lyon", "bordeaux", "nantes", "lille", "rennes", "toulouse", "marseille", "strasbourg"],
  germany: ["berlin", "hamburg", "munich", "köln", "cologne", "frankfurt", "leipzig", "düsseldorf", "dusseldorf"],
  hungary: ["budapest"]
};

export interface GenreCleaningContext {
  city?: string | null;
  country?: string | null;
  targetCity?: string | null;
  targetCountry?: string | null;
  target?: string | null;
  locationTags?: string[];
  languageTags?: string[];
}

export interface CleanArtistGenresResult {
  genres: string[];
  discardedTags: string[];
  locationTags: string[];
  nonGenreTags: string[];
}

export interface GenreCompatibilityResult {
  compatible: boolean;
  level: GenreCompatibilityLevel;
  confidence: number;
  matchedGenres: string[];
  rejectedGenres: string[];
  reason: string;
}

export function cleanArtistGenres(
  rawTagsOrGenres: string[],
  userGenres: string[],
  context: GenreCleaningContext = {}
): CleanArtistGenresResult {
  const normalizedUserGenres = normalizeGenres(userGenres);
  const genreLikeTags = rawTagsOrGenres
    .map(normalizeGenre)
    .filter((tag) => tag && !isNonGenreTag(tag) && !isLocationOrLanguageTag(tag, context));
  const compatibilityContext = evaluateGenreCompatibility(normalizedUserGenres, genreLikeTags);
  const kept: string[] = [];
  const discardedTags: string[] = [];
  const locationTags: string[] = [];
  const nonGenreTags: string[] = [];

  for (const raw of rawTagsOrGenres) {
    const normalized = normalizeGenre(raw);
    if (!normalized) {
      continue;
    }

    if (isNonGenreTag(normalized)) {
      nonGenreTags.push(normalized);
      discardedTags.push(normalized);
      continue;
    }

    if (isLocationOrLanguageTag(normalized, context)) {
      locationTags.push(normalized);
      discardedTags.push(normalized);
      continue;
    }

    if (!isGenreLikeTag(normalized)) {
      discardedTags.push(normalized);
      continue;
    }

    if (
      compatibilityContext.compatible ||
      compatibilityContext.level === "unknown" ||
      compatibilityContext.level === "insufficient_evidence" ||
      compatibilityContext.level === "weak_broad_match"
    ) {
      kept.push(normalized);
      continue;
    }

    if (compatibilityContext.level === "broad_weak" && compatibilityContext.matchedGenres.includes(normalized)) {
      kept.push(normalized);
      continue;
    }

    discardedTags.push(normalized);
  }

  return {
    genres: sortGenresByUserRelevance(preferSpecificGenres(uniqueStrings(kept)), normalizedUserGenres),
    discardedTags: uniqueStrings(discardedTags),
    locationTags: uniqueStrings(locationTags),
    nonGenreTags: uniqueStrings(nonGenreTags)
  };
}

export function collectGenreGateGenres(
  rawTagsOrGenres: string[],
  cleanedGenres: string[] = [],
  context: GenreCleaningContext = {}
): string[] {
  const gateGenres = [...cleanedGenres];

  for (const raw of rawTagsOrGenres) {
    const normalized = normalizeGenre(raw);
    if (!normalized || isNonGenreTag(normalized) || isLocationOrLanguageTag(normalized, context)) {
      continue;
    }

    if (isGenreLikeTag(normalized)) {
      gateGenres.push(normalized);
      continue;
    }

    const inferred = inferGenreLikeTag(normalized);
    if (inferred) {
      gateGenres.push(inferred);
    }
  }

  return uniqueStrings(gateGenres);
}

export function evaluateGenreCompatibility(userGenres: string[], candidateGenres: string[]): GenreCompatibilityResult {
  const user = normalizeGenres(userGenres);
  const candidate = normalizeGenres(candidateGenres);

  if (candidate.length === 0) {
    return {
      compatible: false,
      level: "unknown",
      confidence: 0.2,
      matchedGenres: [],
      rejectedGenres: [],
      reason: "missing_candidate_genres"
    };
  }

  const exactMatches = candidate.filter((genre) => user.includes(genre));
  if (exactMatches.length > 0) {
    return {
      compatible: true,
      level: "compatible",
      confidence: 0.95,
      matchedGenres: uniqueStrings(exactMatches),
      rejectedGenres: candidate.filter((genre) => !exactMatches.includes(genre)),
      reason: "exact_genre_match"
    };
  }

  const userFamilies = getGenreFamilies(user);
  const candidateFamilies = getGenreFamilies(candidate);
  const sharedFamilies = userFamilies.filter((family) => candidateFamilies.includes(family));
  const matchedGenres = candidate.filter((genre) => getGenreFamilies([genre]).some((family) => userFamilies.includes(family)));
  const rejectedGenres = candidate.filter((genre) => !matchedGenres.includes(genre));

  if (sharedFamilies.length > 0 && hasSpecificFamilyEvidence(user, candidate, sharedFamilies)) {
    return {
      compatible: true,
      level: "compatible",
      confidence: 0.82,
      matchedGenres: uniqueStrings(matchedGenres),
      rejectedGenres,
      reason: "same_genre_family"
    };
  }

  if (sharedFamilies.length > 0 && matchedGenres.length > 0) {
    return {
      compatible: true,
      level: "weak_broad_match",
      confidence: 0.55,
      matchedGenres: uniqueStrings(matchedGenres),
      rejectedGenres,
      reason: "same_family_broad_genre"
    };
  }

  if (hasAdjacentGenreEvidence(user, candidate, userFamilies, candidateFamilies)) {
    return {
      compatible: true,
      level: "compatible",
      confidence: 0.65,
      matchedGenres: candidate.filter((genre) => isSpecificGenre(genre)),
      rejectedGenres: candidate.filter((genre) => !isSpecificGenre(genre)),
      reason: "adjacent_genre_with_specific_overlap"
    };
  }

  if (hasOnlyInsufficientGenreEvidence(candidate, userFamilies, candidateFamilies)) {
    return {
      compatible: false,
      level: "insufficient_evidence",
      confidence: 0.35,
      matchedGenres: [],
      rejectedGenres: [],
      reason: "insufficient_genre_evidence"
    };
  }

  return {
    compatible: false,
    level: "explicitly_incompatible",
    confidence: 0.05,
    matchedGenres: [],
    rejectedGenres: candidate,
    reason: "explicit_incompatible_genre"
  };
}

export function classifyGenreSpecificity(genre: string): GenreSpecificity {
  return BROAD_GENRES.has(normalizeGenre(genre)) ? "broad" : "specific";
}

export function normalizeGenre(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ");
  return MUSIC_GENRE_ALIASES[normalized] ?? normalized;
}

export function isLocationOrLanguageTag(tag: string, context: GenreCleaningContext = {}): boolean {
  const normalized = normalizeGenre(tag);
  if (!normalized) {
    return false;
  }

  const contextTags = buildContextLocationLanguageTags(context);
  return contextTags.has(normalized) || GENERIC_LOCATION_LANGUAGE_TAGS.has(normalized);
}

function buildContextLocationLanguageTags(context: GenreCleaningContext): Set<string> {
  const tags = new Set<string>();
  const rawContextTags = [
    context.city,
    context.country,
    context.targetCity,
    context.targetCountry,
    ...(context.locationTags ?? []),
    ...(context.languageTags ?? [])
  ];

  for (const value of rawContextTags) {
    const normalized = value ? normalizeGenre(value) : "";
    if (normalized) {
      tags.add(normalized);
    }
  }

  const target = normalizeGenre(context.target ?? "");
  if (target) {
    for (const [country, aliases] of Object.entries(COUNTRY_LANGUAGE_TAGS)) {
      if (target.includes(country) || aliases.some((alias) => target.includes(alias))) {
        aliases.forEach((alias) => tags.add(alias));
        for (const city of COUNTRY_CITY_TAGS[country] ?? []) {
          tags.add(normalizeGenre(city));
        }
      }
    }
  }

  for (const countryValue of [context.country, context.targetCountry]) {
    const country = normalizeGenre(countryValue ?? "");
    if (!country) {
      continue;
    }
    for (const alias of COUNTRY_LANGUAGE_TAGS[country] ?? []) {
      tags.add(normalizeGenre(alias));
    }
    for (const city of COUNTRY_CITY_TAGS[country] ?? []) {
      tags.add(normalizeGenre(city));
    }
  }

  return tags;
}

function normalizeGenres(genres: string[]): string[] {
  return uniqueStrings(genres.map(normalizeGenre).filter(Boolean));
}

function isNonGenreTag(tag: string): boolean {
  return (
    NON_GENRE_TAGS.has(tag) ||
    /^\d{4}s?$/.test(tag) ||
    /^\d+s$/.test(tag) ||
    tag.includes("listeners") ||
    tag.includes("music from")
  );
}

function isGenreLikeTag(tag: string): boolean {
  return (KNOWN_MUSIC_GENRES as Set<string>).has(tag) || Boolean(inferGenreLikeTag(tag));
}

function inferGenreLikeTag(value: string): string | null {
  if ((KNOWN_MUSIC_GENRES as Set<string>).has(value)) {
    return value;
  }

  const orderedGenres = [...KNOWN_MUSIC_GENRES].sort((left, right) => right.length - left.length);
  const knownMatch = orderedGenres.find((genre) => new RegExp(`\\b${escapeRegExp(genre)}\\b`).test(value));
  if (knownMatch) {
    return knownMatch;
  }

  if (value.includes("pop")) {
    return "pop";
  }

  if (/\brock\b/.test(value)) {
    return "rock";
  }

  return null;
}

function getGenreFamilies(genres: string[]): GenreFamily[] {
  const families = new Set<GenreFamily>();
  for (const genre of genres) {
    for (const [family, familyGenres] of Object.entries(GENRE_FAMILIES) as Array<[GenreFamily, readonly string[]]>) {
      if ((familyGenres as readonly string[]).includes(genre)) {
        families.add(family);
      }
    }
  }
  return [...families];
}

function hasSpecificFamilyEvidence(userGenres: string[], candidateGenres: string[], sharedFamilies: GenreFamily[]): boolean {
  for (const family of sharedFamilies) {
    const familyGenres = GENRE_FAMILIES[family] as readonly string[];
    const userInFamily = userGenres.filter((genre) => familyGenres.includes(genre));
    const candidateInFamily = candidateGenres.filter((genre) => familyGenres.includes(genre));
    const userSpecific = userInFamily.some(isSpecificGenre);
    const candidateSpecific = candidateInFamily.some(isSpecificGenre);

    if (candidateSpecific && (userSpecific || !userSpecific)) {
      return true;
    }
  }

  return false;
}

function isSpecificGenre(genre: string): boolean {
  return classifyGenreSpecificity(genre) === "specific";
}

function hasAdjacentGenreEvidence(
  userGenres: string[],
  candidateGenres: string[],
  userFamilies: GenreFamily[],
  candidateFamilies: GenreFamily[]
): boolean {
  const punkWithIndieAlt =
    (userFamilies.includes("punk") && candidateFamilies.includes("indie_alt")) ||
    (userFamilies.includes("indie_alt") && candidateFamilies.includes("punk"));
  if (!punkWithIndieAlt) {
    return false;
  }

  return candidateGenres.some((genre) => isSpecificGenre(genre) && /\b(punk|emo|hardcore)\b/.test(genre));
}

function hasOnlyInsufficientGenreEvidence(
  candidateGenres: string[],
  userFamilies: GenreFamily[],
  candidateFamilies: GenreFamily[]
): boolean {
  if (candidateGenres.length === 0) {
    return true;
  }

  const punkIndieAltAdjacent =
    (userFamilies.includes("punk") && candidateFamilies.includes("indie_alt")) ||
    (userFamilies.includes("indie_alt") && candidateFamilies.includes("punk"));

  return candidateGenres.every((genre) => {
    if (AMBIGUOUS_INSUFFICIENT_GENRES.has(genre)) {
      return true;
    }
    const genreFamilies = getGenreFamilies([genre]);
    return punkIndieAltAdjacent && genreFamilies.includes("indie_alt");
  });
}

function sortGenresByUserRelevance(genres: string[], userGenres: string[]): string[] {
  return [...genres].sort((left, right) => {
    const leftScore = genreSortScore(left, userGenres);
    const rightScore = genreSortScore(right, userGenres);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    return left.localeCompare(right);
  });
}

function genreSortScore(genre: string, userGenres: string[]): number {
  if (userGenres.includes(genre)) {
    return 4;
  }
  const compatibility = evaluateGenreCompatibility(userGenres, [genre]);
  if (compatibility.compatible) {
    return 3;
  }
  if (compatibility.level === "weak_broad_match") {
    return 2;
  }
  return 1;
}

function preferSpecificGenres(genres: string[]): string[] {
  const result = [...genres];
  for (const broad of BROAD_GENRES) {
    const broadFamilies = getGenreFamilies([broad]);
    if (broadFamilies.length === 0) {
      continue;
    }
    const hasSpecificInSameFamily = result.some(
      (genre) => genre !== broad && isSpecificGenre(genre) && getGenreFamilies([genre]).some((family) => broadFamilies.includes(family))
    );
    if (hasSpecificInSameFamily) {
      const index = result.indexOf(broad);
      if (index >= 0) {
        result.splice(index, 1);
      }
    }
  }
  return result;
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
