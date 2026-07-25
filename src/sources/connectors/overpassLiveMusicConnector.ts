import { debugLog, warnLog } from "../../utils/logger.js";
import { classifyLiveMusicEntityTypeFromOsmTags, type OsmTags } from "../liveMusicEntities/entityTypeMapping.js";
import type { GeoPoint } from "../liveMusicEntities/geoDiscoveryConfig.js";
import type { LiveMusicEntityCandidate } from "../liveMusicEntities/types.js";

// OpenStreetMap data is incomplete and heterogeneous (issue #183 technical
// notes): it seeds geographic candidates via amenity=music_venue and
// live_music=yes, but is never treated as proof of current activity. Every
// candidate this connector produces has an empty `activityEvidence`, so the
// qualification gate (activityEvidence.ts) rejects it until another source
// (a programme page, a recent event, ...) supplies real evidence.
const OVERPASS_SOURCE_RELIABILITY = 0.4;
const DEFAULT_OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const DEFAULT_USER_AGENT = "ArtistRadar/0.1.0 ( https://github.com/pissartel/Artist-Radar )";

export interface OverpassBoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const KM_PER_DEGREE_LATITUDE = 110.574;

/** Builds a bounding box around a center point for a given radius, in kilometers. */
export function buildOverpassBoundingBox(center: GeoPoint, radiusKm: number): OverpassBoundingBox {
  const latDelta = radiusKm / KM_PER_DEGREE_LATITUDE;
  const kmPerDegreeLongitude = KM_PER_DEGREE_LATITUDE * Math.cos((center.latitude * Math.PI) / 180);
  const lonDelta = kmPerDegreeLongitude > 0 ? radiusKm / kmPerDegreeLongitude : radiusKm / KM_PER_DEGREE_LATITUDE;

  return {
    south: center.latitude - latDelta,
    north: center.latitude + latDelta,
    west: center.longitude - lonDelta,
    east: center.longitude + lonDelta
  };
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

export interface OverpassConnectorOptions {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  userAgent?: string;
}

export interface OverpassDiscoveryResult {
  candidates: LiveMusicEntityCandidate[];
  warnings: string[];
}

function buildOverpassQuery(bbox: OverpassBoundingBox): string {
  const bboxClause = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:25];(
  node["amenity"="music_venue"](${bboxClause});
  way["amenity"="music_venue"](${bboxClause});
  node["live_music"="yes"](${bboxClause});
  way["live_music"="yes"](${bboxClause});
);out center tags;`;
}

/**
 * Queries the Overpass API for live-music-relevant OSM nodes/ways within a
 * bounding box, and normalizes matches into `LiveMusicEntityCandidate`s.
 * Respects Overpass usage guidance: a single batched query per call, an
 * identifying User-Agent, and no retry/hammering on failure.
 */
export async function discoverLiveMusicVenuesFromOverpass(
  boundingBox: OverpassBoundingBox,
  options: OverpassConnectorOptions = {}
): Promise<OverpassDiscoveryResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? DEFAULT_OVERPASS_ENDPOINT;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const warnings: string[] = [];

  const query = buildOverpassQuery(boundingBox);
  debugLog("sources", "overpass live-music query", { boundingBox });

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": userAgent
      },
      body: `data=${encodeURIComponent(query)}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLog("sources", "overpass request failed", { message });
    return { candidates: [], warnings: [`Overpass request failed: ${message}`] };
  }

  if (!response.ok) {
    warnLog("sources", "overpass request rejected", { status: response.status });
    return { candidates: [], warnings: [`Overpass request rejected with status ${response.status}`] };
  }

  const data = (await response.json()) as OverpassResponse;
  const elements = data.elements ?? [];

  const candidates: LiveMusicEntityCandidate[] = [];
  for (const element of elements) {
    const candidate = elementToCandidate(element);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  debugLog("sources", "overpass live-music response", { elementCount: elements.length, candidateCount: candidates.length });
  return { candidates, warnings };
}

function elementToCandidate(element: OverpassElement): LiveMusicEntityCandidate | null {
  const tags = (element.tags ?? {}) as OsmTags;
  const classification = classifyLiveMusicEntityTypeFromOsmTags(tags);
  if (!classification) {
    return null;
  }

  const name = tags.name?.trim();
  if (!name) {
    return null;
  }

  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;

  return {
    externalIds: { osm: `${element.type}/${element.id}` },
    name,
    entityType: classification.entityType,
    city: tags["addr:city"]?.trim() || undefined,
    country: tags["addr:country"]?.trim() || undefined,
    latitude,
    longitude,
    address: buildAddress(tags),
    phone: (tags.phone ?? tags["contact:phone"])?.trim() || undefined,
    websiteUrl: (tags.website ?? tags["contact:website"])?.trim() || undefined,
    sourceRecords: [
      {
        sourceType: "overpass_osm",
        sourceName: "OpenStreetMap (Overpass)",
        sourceUrl,
        retrievedAt: new Date().toISOString(),
        reliabilityScore: OVERPASS_SOURCE_RELIABILITY,
        raw: { tags: element.tags ?? {}, matchedKeyword: classification.matchedKeyword }
      }
    ],
    // Deliberately empty: OSM tags seed a candidate but never constitute
    // activity evidence on their own (see module comment above).
    activityEvidence: []
  };
}

function buildAddress(tags: OsmTags): string | undefined {
  const parts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:postcode"], tags["addr:city"]]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" ") : undefined;
}
