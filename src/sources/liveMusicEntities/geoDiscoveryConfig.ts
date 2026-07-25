// Default search radius in kilometers around the requested city. Always
// overridable per-search or via env, never hardcoded into a query (issue
// #183: "The search radius should be configurable and not hard-coded").
export const DEFAULT_LIVE_MUSIC_SEARCH_RADIUS_KM = 25;

interface RadiusEnv {
  LIVE_MUSIC_DISCOVERY_RADIUS_KM?: string;
}

export function resolveLiveMusicSearchRadiusKm(
  overrideKm?: number | null,
  env: RadiusEnv = process.env
): number {
  if (typeof overrideKm === "number" && Number.isFinite(overrideKm) && overrideKm > 0) {
    return overrideKm;
  }
  const fromEnv = Number(env.LIVE_MUSIC_DISCOVERY_RADIUS_KM);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return DEFAULT_LIVE_MUSIC_SEARCH_RADIUS_KM;
}

export interface GeographicSearchScopeInput {
  city: string;
  country?: string | null;
  radiusKm?: number | null;
  surroundingCities?: string[];
  includeRegion?: boolean;
  region?: string | null;
}

export interface GeographicSearchScope {
  city: string;
  country: string | null;
  radiusKm: number;
  surroundingCities: string[];
  includeRegion: boolean;
  region: string | null;
}

/**
 * Resolves the full geographic scope for a discovery run: the requested
 * city, its configurable radius, any surrounding municipalities supplied by
 * the caller (e.g. from a geocoding service), and optionally the wider
 * region (acceptance criterion: "Search radius includes surrounding
 * municipalities").
 */
export function resolveGeographicSearchScope(
  input: GeographicSearchScopeInput,
  env: RadiusEnv = process.env
): GeographicSearchScope {
  return {
    city: input.city.trim(),
    country: input.country?.trim() || null,
    radiusKm: resolveLiveMusicSearchRadiusKm(input.radiusKm, env),
    surroundingCities: uniqueStrings(input.surroundingCities ?? []),
    includeRegion: input.includeRegion ?? false,
    region: input.region?.trim() || null
  };
}

export function allSearchLocations(scope: GeographicSearchScope): string[] {
  const locations = [scope.city, ...scope.surroundingCities];
  if (scope.includeRegion && scope.region) {
    locations.push(scope.region);
  }
  return uniqueStrings(locations);
}

const EARTH_RADIUS_KM = 6371;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** Great-circle distance between two points, in kilometers. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isWithinRadiusKm(a: GeoPoint, b: GeoPoint, radiusKm: number): boolean {
  return distanceKm(a, b) <= radiusKm;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
