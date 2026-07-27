import { debugLog, warnLog } from "../../utils/logger.js";
import { fetchWithTimeout, parseTimeoutMs } from "../../utils/fetchWithTimeout.js";
import { TtlCache } from "../../utils/ttlCache.js";
import { normalizeKey } from "../../utils/venueNameNormalization.js";
import { distanceKm, resolveLiveMusicSearchRadiusKm, type GeoPoint } from "../liveMusicEntities/geoDiscoveryConfig.js";
import type { LiveMusicEntityCandidate } from "../liveMusicEntities/types.js";
import {
  isNationwideFranceLocationText,
  resolveSearchLocationCoordinates
} from "./frenchLocationResolution.js";

// The French Ministry of Culture's official open-data dataset of subsidized
// artistic-creation structures (issue #198) — SMAC ("Scène de musiques
// actuelles") records are one category among many (Scène Nationale, Opéra,
// FRAC, ...) in this same dataset. Schema verified live against the real
// resource before writing this connector; see the field notes below.
export const SMAC_DATASET_JSON_URL = "https://www.data.gouv.fr/api/1/datasets/r/ebf1f7da-6877-4068-affc-fe834f2f07db";
export const SMAC_DATASET_ID = "5af120f4b595087cfabcde87";
export const SMAC_DATASET_RESOURCE_ID = "ebf1f7da-6877-4068-affc-fe834f2f07db";
// The dataset's own human-readable page — used as the evidence/source URL
// for every candidate, since individual structures don't have their own
// page in this dataset. Never the raw JSON download URL, and never a
// per-venue website (the dataset doesn't provide one).
export const SMAC_DATASET_PAGE_URL = "https://www.data.gouv.fr/datasets/structures-de-la-creation-artistique-1";
const SMAC_SOURCE_NAME = "Ministère de la Culture — Structures de la création artistique";

const DEFAULT_TIMEOUT_MS = 15_000;
const DATASET_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LABELLED_RELIABILITY = 0.95;

export type SmacStatus = "labelled" | "pending";

// Real field names observed by fetching and inspecting the live resource
// (373 total records, 97 SMAC-related) rather than assumed:
// - `structure`: category field. Exact SMAC values are "SMAC" and
//   "SMAC en cours de labellisation" — no other spelling variant appears.
// - `nom1`: the structure/venue name, always present for SMAC records.
// - `nom2`: usually the managing association/commune, not a venue name —
//   never used as `name`.
// - `adresse1`/`adresse2`: street address; `adresse2` is often null.
// - `cp`: postal code as a *number* — codes starting with 0 need
//   zero-padding back to 5 digits when displayed.
// - `ville`: city, as published (uppercase in the source data).
// - `region`: present for 95/97 SMAC records.
// - `longitude`/`latitude`/`coordonnees_geoloc`: always null for every SMAC
//   record observed — do not rely on these despite them being top-level
//   fields; kept only for completeness of the documented shape.
// - `coordonnees_finales`: `{ lat, lon }` object, present for 96/97 SMAC
//   records — the reliable coordinate source.
// - `coordonnees_ban`: a `"lat, lon"` string from the BAN geocoder, present
//   for 96/97 records — used as a fallback when `coordonnees_finales` is
//   absent.
// There is no department field and no stable external identifier anywhere
// in the real dataset, despite either being a reasonable assumption —
// documented here rather than guessed at or silently invented.
export interface RawSmacRecord {
  structure?: string | null;
  nom1?: string | null;
  nom2?: string | null;
  adresse1?: string | null;
  adresse2?: string | null;
  cp?: number | string | null;
  ville?: string | null;
  longitude?: string | null;
  latitude?: string | null;
  coordonnees_geoloc?: string | null;
  coordonnees_ban?: string | null;
  coordonnees_finales?: { lat?: number; lon?: number } | null;
  region?: string | null;
}

const SMAC_STRUCTURE_VALUES: Record<string, SmacStatus> = {
  smac: "labelled",
  "smac en cours de labellisation": "pending"
};

export interface SmacDatasetConnectorEnv {
  ENABLE_SMAC_DISCOVERY?: string;
  SMAC_DATASET_TIMEOUT_MS?: string;
}

// A public, free, no-auth-required open-data source — defaults to enabled,
// matching this repo's existing policy for stable free sources (e.g.
// ENABLE_SCENE_AGENDAS), unless explicitly disabled.
export function isSmacDiscoveryEnabled(env: SmacDatasetConnectorEnv = process.env): boolean {
  return env.ENABLE_SMAC_DISCOVERY !== "false";
}

export interface SmacDatasetConnectorOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  cache?: TtlCache<string, RawSmacRecord[]>;
  env?: SmacDatasetConnectorEnv;
}

export interface SmacDiscoveryResult {
  candidates: LiveMusicEntityCandidate[];
  warnings: string[];
  /** Total records in the raw dataset, before SMAC filtering — for logging/diagnostics. */
  totalDatasetRecords: number;
}

const CACHE_KEY = "smac-dataset";
const defaultDatasetCache = new TtlCache<string, RawSmacRecord[]>(DATASET_CACHE_TTL_MS);

/** Clears the module-level dataset cache — test-only, mirrors the label providers' reset-cache convention. */
export function resetSmacDatasetCache(): void {
  defaultDatasetCache.clear();
}

/**
 * Fetches (and caches, 24h TTL) the Ministry of Culture's open dataset, then
 * filters and normalizes SMAC/SMAC-en-cours-de-labellisation records into
 * `LiveMusicEntityCandidate`s. Never throws: a fetch/parse failure degrades
 * to an empty result with a warning, since a temporary source outage must
 * never fail the whole opportunity search.
 */
export async function discoverSmacVenuesFromMinistryOfCultureDataset(
  options: SmacDatasetConnectorOptions = {}
): Promise<SmacDiscoveryResult> {
  const env = options.env ?? (process.env as SmacDatasetConnectorEnv);
  if (!isSmacDiscoveryEnabled(env)) {
    debugLog("smac", "discovery disabled by ENABLE_SMAC_DISCOVERY=false");
    return { candidates: [], warnings: [], totalDatasetRecords: 0 };
  }

  const cache = options.cache ?? defaultDatasetCache;
  const warnings: string[] = [];

  let records: RawSmacRecord[];
  try {
    records = await cache.getOrCreate(CACHE_KEY, () => fetchDataset(options));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLog("smac", "dataset fetch failed", { message });
    return { candidates: [], warnings: [`SMAC dataset fetch failed: ${message}`], totalDatasetRecords: 0 };
  }

  debugLog("smac", "loaded cultural structures dataset", { recordCount: records.length });

  const candidates: LiveMusicEntityCandidate[] = [];
  let skippedMalformed = 0;
  for (const record of records) {
    const status = classifySmacStatus(record.structure);
    if (!status) {
      continue;
    }
    const candidate = recordToCandidate(record, status);
    if (!candidate) {
      skippedMalformed += 1;
      continue;
    }
    candidates.push(candidate);
  }

  if (skippedMalformed > 0) {
    debugLog("smac", "skipped malformed SMAC records", { skippedMalformed });
  }
  debugLog("smac", "detected SMAC records", { smacCount: candidates.length });

  return { candidates, warnings, totalDatasetRecords: records.length };
}

/** Classifies the dataset's own `structure` field, normalized (case/accents/whitespace) — never a substring match against unrelated fields. */
export function classifySmacStatus(structure: string | null | undefined): SmacStatus | null {
  if (!structure) {
    return null;
  }
  return SMAC_STRUCTURE_VALUES[normalizeKey(structure)] ?? null;
}

async function fetchDataset(options: SmacDatasetConnectorOptions): Promise<RawSmacRecord[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? parseTimeoutMs(process.env.SMAC_DATASET_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  debugLog("smac", "fetching official Ministry of Culture dataset", { url: SMAC_DATASET_JSON_URL });
  const response = await fetchWithTimeout(SMAC_DATASET_JSON_URL, { method: "GET" }, timeoutMs, fetchImpl, "smac");

  if (!response.ok) {
    throw new Error(`dataset request rejected with status ${response.status}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`dataset response was not valid JSON: ${message}`);
  }

  if (!Array.isArray(data)) {
    throw new Error("dataset response was not a JSON array");
  }

  return data as RawSmacRecord[];
}

function recordToCandidate(record: RawSmacRecord, status: SmacStatus): LiveMusicEntityCandidate | null {
  const name = record.nom1?.trim();
  if (!name) {
    return null;
  }

  const coordinates = resolveCoordinates(record);
  const address = buildAddress(record);
  const city = record.ville?.trim() || undefined;
  const region = record.region?.trim() || undefined;

  return {
    externalIds: {},
    name,
    entityType: "smac",
    city,
    country: "France",
    latitude: coordinates?.latitude,
    longitude: coordinates?.longitude,
    address,
    sourceRecords: [
      {
        sourceType: "official_open_data",
        sourceName: SMAC_SOURCE_NAME,
        sourceUrl: SMAC_DATASET_PAGE_URL,
        retrievedAt: new Date().toISOString(),
        reliabilityScore: LABELLED_RELIABILITY,
        raw: {
          structure: record.structure ?? null,
          smacStatus: status,
          postalCode: normalizedPostalCode(record.cp),
          region: region ?? null
        }
      }
    ],
    // An official state label is itself explicit confirmation of live-music
    // activity — not a bare directory listing — so this honestly satisfies
    // the existing activity-evidence qualification gate without inventing
    // genre/audience data the dataset doesn't provide.
    activityEvidence: [
      {
        kind: "explicit_live_music_activity",
        description:
          status === "labelled"
            ? "Officially labelled SMAC (Scène de musiques actuelles) by the French Ministry of Culture."
            : "In the process of being labelled as a SMAC (Scène de musiques actuelles) by the French Ministry of Culture.",
        sourceUrl: SMAC_DATASET_PAGE_URL,
        observedAt: null,
        collectedAt: new Date().toISOString(),
        confidence: status === "labelled" ? 0.95 : 0.7
      }
    ]
  };
}

function resolveCoordinates(record: RawSmacRecord): GeoPoint | null {
  const finalCoords = record.coordonnees_finales;
  if (finalCoords && typeof finalCoords.lat === "number" && typeof finalCoords.lon === "number") {
    return { latitude: finalCoords.lat, longitude: finalCoords.lon };
  }
  return parseBanCoordinates(record.coordonnees_ban);
}

function parseBanCoordinates(value: string | null | undefined): GeoPoint | null {
  if (!value) {
    return null;
  }
  const parts = value.split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  return { latitude: parts[0], longitude: parts[1] };
}

function normalizedPostalCode(cp: RawSmacRecord["cp"]): string | null {
  if (cp === null || cp === undefined || cp === "") {
    return null;
  }
  const digits = String(cp).trim();
  return /^\d+$/.test(digits) ? digits.padStart(5, "0") : digits;
}

function buildAddress(record: RawSmacRecord): string | undefined {
  const postalCode = normalizedPostalCode(record.cp);
  const parts = [record.adresse1?.trim(), record.adresse2?.trim(), postalCode, record.ville?.trim()].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(", ") : undefined;
}

export interface LocationFilteredSmacCandidate {
  candidate: LiveMusicEntityCandidate;
  distanceKm: number | null;
}

export type SmacLocationMatchMode = "distance" | "nationwide" | "text_fallback";

export interface SmacLocationFilterResult {
  candidates: LocationFilteredSmacCandidate[];
  matchMode: SmacLocationMatchMode;
}

/**
 * Filters (and, when possible, sorts nearest-first) SMAC candidates against
 * the selected search location (issue #198 §6). Three tiers, tried in
 * order: (1) real distance filtering when the location resolves to
 * approximate coordinates; (2) the full national set for an explicit
 * "France"-level query; (3) best-effort normalized city/region text
 * matching otherwise — never the full national list by default. Shared by
 * both the connector's own callers and the dev CLI script so the filter
 * logic exists in exactly one place.
 */
export function filterSmacCandidatesByLocation(
  candidates: LiveMusicEntityCandidate[],
  locationText: string,
  radiusKmOverride?: number | null
): SmacLocationFilterResult {
  const origin = resolveSearchLocationCoordinates(locationText);
  if (origin) {
    const radiusKm = resolveLiveMusicSearchRadiusKm(radiusKmOverride);
    const withinRadius = candidates
      .map((candidate) => ({ candidate, distanceKm: candidateDistanceKm(candidate, origin) }))
      .filter((entry): entry is LocationFilteredSmacCandidate & { distanceKm: number } => entry.distanceKm !== null && entry.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    return { candidates: withinRadius, matchMode: "distance" };
  }

  if (isNationwideFranceLocationText(locationText)) {
    return { candidates: candidates.map((candidate) => ({ candidate, distanceKm: null })), matchMode: "nationwide" };
  }

  const normalizedQuery = normalizeKey(locationText.split(",")[0] ?? locationText);
  const matched = candidates.filter((candidate) => {
    const city = candidate.city ? normalizeKey(candidate.city) : "";
    const region = extractRegionFromSourceRecord(candidate);
    return city === normalizedQuery || (region !== null && normalizeKey(region) === normalizedQuery);
  });
  return { candidates: matched.map((candidate) => ({ candidate, distanceKm: null })), matchMode: "text_fallback" };
}

function candidateDistanceKm(candidate: LiveMusicEntityCandidate, origin: GeoPoint): number | null {
  if (candidate.latitude === undefined || candidate.longitude === undefined) {
    return null;
  }
  return distanceKm(origin, { latitude: candidate.latitude, longitude: candidate.longitude });
}

function extractRegionFromSourceRecord(candidate: LiveMusicEntityCandidate): string | null {
  const raw = candidate.sourceRecords.find((record) => record.sourceType === "official_open_data")?.raw;
  const region = raw?.region;
  return typeof region === "string" && region.trim() ? region : null;
}
