import type { Opportunity } from "@/types";

interface NominatimResult {
  lat?: string;
  lon?: string;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

function hasCoordinates(opportunity: Opportunity): boolean {
  return Number.isFinite(opportunity.latitude) && Number.isFinite(opportunity.longitude);
}

function buildQuery(opportunity: Opportunity): { query: string; precision: "exact" | "approximate" } | null {
  const cityAndCountry = [opportunity.city, opportunity.country].filter(Boolean).join(", ");
  if (opportunity.address) {
    return {
      query: [opportunity.address, cityAndCountry].filter(Boolean).join(", "),
      precision: "exact",
    };
  }
  if (cityAndCountry) {
    return { query: cityAndCountry, precision: "approximate" };
  }
  return null;
}

export async function geocodeOpportunity(
  opportunity: Opportunity,
  fetcher: typeof fetch = fetch
): Promise<Opportunity> {
  if (hasCoordinates(opportunity)) {
    return {
      ...opportunity,
      locationPrecision: opportunity.locationPrecision ?? (opportunity.address ? "exact" : "approximate"),
    };
  }

  const location = buildQuery(opportunity);
  if (!location) return opportunity;

  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", location.query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");

    // Next's data cache persists this result across requests/deploy instances.
    // Coordinates are then included in the API response, so opening a detail
    // page never triggers another geocoding request.
    const response = await fetcher(url, {
      headers: { "User-Agent": "Artist-Radar/1.0 (booking opportunity geocoder)" },
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!response.ok) return opportunity;

    const [result] = (await response.json()) as NominatimResult[];
    const latitude = Number(result?.lat);
    const longitude = Number(result?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return opportunity;

    return { ...opportunity, latitude, longitude, locationPrecision: location.precision };
  } catch {
    return opportunity;
  }
}

export async function geocodeOpportunities(
  opportunities: Opportunity[],
  fetcher: typeof fetch = fetch
): Promise<Opportunity[]> {
  // Nominatim asks clients to avoid concurrent bulk requests. Search limits
  // are small, so resolving sequentially is predictable and policy-friendly.
  const geocoded: Opportunity[] = [];
  for (const opportunity of opportunities) {
    geocoded.push(await geocodeOpportunity(opportunity, fetcher));
  }
  return geocoded;
}
