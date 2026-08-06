import type { BookingSearchInput, BookingTarget } from "./types.js";

const COUNTRY_ALIASES: Record<string, string> = {
  fr: "france",
  france: "france",
  french: "france",
  "french republic": "france",
  "republique francaise": "france",
  "république française": "france",
  us: "united states",
  usa: "united states",
  "u s a": "united states",
  "u.s.a.": "united states",
  "united states": "united states",
  "united states of america": "united states",
  america: "united states",
  ca: "canada",
  canada: "canada",
  it: "italy",
  italy: "italy",
  gb: "united kingdom",
  uk: "united kingdom",
  "united kingdom": "united kingdom",
  de: "germany",
  germany: "germany",
  es: "spain",
  spain: "spain",
  be: "belgium",
  belgium: "belgium",
  ch: "switzerland",
  switzerland: "switzerland"
};

const INTERNATIONAL_PATTERN = /\b(international|worldwide|global|europe|european|ue|eu|benelux|world tour)\b/i;
const COUNTRY_PATTERNS: Array<{ country: string; pattern: RegExp }> = [
  { country: "france", pattern: /\b(france|french|francais|francaise|francaises|français|française|françaises)\b/i },
  { country: "united states", pattern: /\b(united states|usa|u\.s\.a\.|american|etats-unis|états-unis)\b/i },
  { country: "canada", pattern: /\b(canada|canadian|canadien)\b/i },
  { country: "italy", pattern: /\b(italy|italian|italie|italien)\b/i },
  { country: "belgium", pattern: /\b(belgium|belgian|belgique|belge)\b/i },
  { country: "switzerland", pattern: /\b(switzerland|swiss|suisse)\b/i },
  { country: "germany", pattern: /\b(germany|german|allemagne|allemand)\b/i },
  { country: "spain", pattern: /\b(spain|spanish|espagne|espagnol)\b/i },
  { country: "united kingdom", pattern: /\b(united kingdom|uk|britain|british|royaume-uni)\b/i }
];

export function normalizeCountryName(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return COUNTRY_ALIASES[normalized] ?? normalized;
}

export function resolveTargetCountry(input: BookingSearchInput): string | null {
  if (input.target && INTERNATIONAL_PATTERN.test(input.target)) return null;
  const patternMatchedTarget = findCountryByPattern(input.target);
  if (patternMatchedTarget) return patternMatchedTarget;
  const target = normalizeCountryName(input.target);
  if (target) return target;
  return normalizeCountryName(input.artistProfile?.country);
}

export function findCountryByPattern(value: string | null | undefined): string | null {
  if (!value) return null;
  return COUNTRY_PATTERNS.find((entry) => entry.pattern.test(value))?.country ?? null;
}

export function isInTargetCountry(target: BookingTarget, targetCountry: string | null): boolean {
  if (!targetCountry) return true;
  const country = normalizeCountryName(target.country);
  return Boolean(country && country === targetCountry);
}

export function hasVerifiedTargetCountry(target: BookingTarget, targetCountry: string | null): boolean {
  return isInTargetCountry(target, targetCountry);
}

export function isInTargetMarket(input: BookingSearchInput, target: BookingTarget, targetCountry: string | null): boolean {
  if (!targetCountry) return true;
  if (isInTargetCountry(target, targetCountry)) return true;
  if (normalizeCountryName(target.country)) return false;
  const targetCity = normalizeCity(target.city);
  const inputCity = normalizeCity(input.city);
  return Boolean(targetCity && inputCity && targetCity === inputCity);
}

export function normalizeTargetMarketCountry(input: BookingSearchInput, target: BookingTarget, targetCountry: string | null): BookingTarget {
  if (!targetCountry || normalizeCountryName(target.country)) return target;
  const targetCity = normalizeCity(target.city);
  const inputCity = normalizeCity(input.city);
  if (!targetCity || !inputCity || targetCity !== inputCity) return target;
  return { ...target, country: displayCountryName(targetCountry) };
}

function displayCountryName(normalizedCountry: string): string {
  if (normalizedCountry === "france") return "France";
  if (normalizedCountry === "united states") return "United States";
  if (normalizedCountry === "united kingdom") return "United Kingdom";
  return normalizedCountry.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeCity(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}
