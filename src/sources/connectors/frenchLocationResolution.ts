import type { GeoPoint } from "../liveMusicEntities/geoDiscoveryConfig.js";

// A small, honest location helper — not a real geocoder. No geocoding
// capability exists anywhere in this codebase (confirmed while researching
// issue #198), so this resolves only what can be resolved without inventing
// precision: an explicit country name/code segment, or a lookup against a
// short table of major French cities. Anything else resolves to null rather
// than being guessed.

// ISO 3166-1 alpha-2 aliases for an explicit trailing country segment (e.g.
// "Lyon, France" or "Marseille, FR"). Deliberately includes a few non-French
// countries too, so exclusion (Brussels, London, ...) is actually exercised
// by this map rather than only ever matching France.
const COUNTRY_ALIASES: Record<string, string> = {
  france: "FR",
  fr: "FR",
  fra: "FR",
  "french republic": "FR",
  "république française": "FR",
  "republique francaise": "FR",
  belgium: "BE",
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
  germany: "DE",
  spain: "ES",
  italy: "IT",
  switzerland: "CH"
};

// Major French cities, used both to resolve a bare city name (no country
// segment) to "FR" and, separately, as the fallback "selected location's own
// coordinates" source for radius-based geographic filtering. Coordinates are
// city-center approximations, not precise geocoding results.
export const FRENCH_CITY_COORDINATES: Record<string, GeoPoint> = {
  paris: { latitude: 48.8566, longitude: 2.3522 },
  marseille: { latitude: 43.2965, longitude: 5.3698 },
  lyon: { latitude: 45.764, longitude: 4.8357 },
  toulouse: { latitude: 43.6047, longitude: 1.4442 },
  nice: { latitude: 43.7102, longitude: 7.262 },
  nantes: { latitude: 47.2184, longitude: -1.5536 },
  strasbourg: { latitude: 48.5734, longitude: 7.7521 },
  montpellier: { latitude: 43.6108, longitude: 3.8767 },
  bordeaux: { latitude: 44.8378, longitude: -0.5792 },
  lille: { latitude: 50.6292, longitude: 3.0573 },
  rennes: { latitude: 48.1173, longitude: -1.6778 },
  reims: { latitude: 49.2583, longitude: 4.0317 },
  toulon: { latitude: 43.1242, longitude: 5.928 },
  grenoble: { latitude: 45.1885, longitude: 5.7245 },
  dijon: { latitude: 47.322, longitude: 5.0415 },
  angers: { latitude: 47.4784, longitude: -0.5632 },
  "le mans": { latitude: 48.0061, longitude: 0.1996 },
  "clermont-ferrand": { latitude: 45.7772, longitude: 3.087 },
  brest: { latitude: 48.3904, longitude: -4.4861 },
  tours: { latitude: 47.3941, longitude: 0.6848 },
  limoges: { latitude: 45.8336, longitude: 1.2611 },
  amiens: { latitude: 49.8941, longitude: 2.2958 },
  metz: { latitude: 49.1193, longitude: 6.1757 },
  nancy: { latitude: 48.6921, longitude: 6.1844 },
  caen: { latitude: 49.1829, longitude: -0.3707 }
};

// A handful of well-known non-French cities, kept only so country-code
// exclusion is genuinely exercised (Brussels, London) rather than every
// unresolved bare city name accidentally falling through to "FR".
const NON_FRENCH_CITY_COUNTRY_CODES: Record<string, string> = {
  brussels: "BE",
  bruxelles: "BE",
  london: "GB"
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Resolves a free-text location string to an ISO 3166-1 alpha-2 country
 * code, or null when it can't be reliably determined. Never guesses: an
 * unrecognized city with no country segment resolves to null, not "FR".
 */
export function resolveCountryCodeFromLocationText(locationText: string): string | null {
  const trimmed = locationText.trim();
  if (!trimmed) {
    return null;
  }

  const segments = trimmed.split(",").map((segment) => normalize(segment)).filter(Boolean);
  const explicitCountrySegment = segments.length > 1 ? segments[segments.length - 1] : null;
  if (explicitCountrySegment && COUNTRY_ALIASES[explicitCountrySegment]) {
    return COUNTRY_ALIASES[explicitCountrySegment];
  }

  // No explicit country segment (or an unrecognized one) — try the whole
  // trimmed string as a bare country name/code, then as a known city name.
  const wholeString = normalize(trimmed);
  if (COUNTRY_ALIASES[wholeString]) {
    return COUNTRY_ALIASES[wholeString];
  }

  const cityName = normalize(segments[0] ?? trimmed);
  if (FRENCH_CITY_COORDINATES[cityName]) {
    return "FR";
  }
  if (NON_FRENCH_CITY_COUNTRY_CODES[cityName]) {
    return NON_FRENCH_CITY_COUNTRY_CODES[cityName];
  }

  return null;
}

/**
 * Resolves a free-text location string to approximate coordinates via the
 * static major-city table above. Used only as a fallback when no real
 * geocoding result is available (issue #198 §6) — never a substitute for
 * genuine geocoding, and returns null rather than guessing for any location
 * not in the table.
 */
export function resolveSearchLocationCoordinates(locationText: string): GeoPoint | null {
  const cityName = normalize(locationText.split(",")[0] ?? locationText);
  return FRENCH_CITY_COORDINATES[cityName] ?? null;
}

/**
 * True only when the location text itself names the country (e.g. "France",
 * "FR") rather than a specific city — an explicit nationwide search, per
 * issue #198 §6's "a nationwide search explicitly targeting France" case.
 * A city-level query like "Bordeaux" is never treated as nationwide.
 */
export function isNationwideFranceLocationText(locationText: string): boolean {
  return COUNTRY_ALIASES[normalize(locationText.trim())] === "FR";
}
