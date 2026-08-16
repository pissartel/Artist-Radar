import type { NormalizedLocation } from "@/types";

export interface GeocodedLocation extends NormalizedLocation {
  latitude: number;
  longitude: number;
  boundingBox?: [number, number, number, number];
}

export function locationCacheKey(location: NormalizedLocation): string {
  return [location.address, location.city, location.country]
    .filter(Boolean)
    .join(", ")
    .trim()
    .toLocaleLowerCase();
}

export function locationQuery(location: NormalizedLocation): string {
  return [location.address, location.city, location.country].filter(Boolean).join(", ");
}

export function hasCoordinates(location?: NormalizedLocation): location is GeocodedLocation {
  return Boolean(location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude));
}
