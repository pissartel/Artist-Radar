import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifySmacStatus,
  discoverSmacVenuesFromMinistryOfCultureDataset,
  filterSmacCandidatesByLocation,
  isSmacDiscoveryEnabled,
  resetSmacDatasetCache,
  SMAC_DATASET_JSON_URL,
  SMAC_DATASET_PAGE_URL,
  type RawSmacRecord
} from "../../src/sources/connectors/smacDatasetConnector.js";
import { hasQualifyingActivityEvidence } from "../../src/sources/liveMusicEntities/activityEvidence.js";
import { TtlCache } from "../../src/utils/ttlCache.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

const ROCK_SCHOOL: RawSmacRecord = {
  structure: "SMAC",
  nom1: "Rock School Barbey",
  nom2: null,
  adresse1: "18 Cours Barbey",
  adresse2: null,
  cp: 33800,
  ville: "BORDEAUX",
  longitude: null,
  latitude: null,
  coordonnees_geoloc: null,
  coordonnees_ban: "44.8355, -0.5654",
  coordonnees_finales: { lat: 44.8355, lon: -0.5654 },
  region: "Nouvelle-Aquitaine"
};

const PENDING_SMAC: RawSmacRecord = {
  structure: "SMAC en cours de labellisation",
  nom1: "Le Forum",
  nom2: "Commune de Vauréal",
  adresse1: "Boulevard de l'Oise",
  adresse2: null,
  cp: 95490,
  ville: "VAUREAL",
  longitude: null,
  latitude: null,
  coordonnees_geoloc: null,
  coordonnees_ban: "49.02959, 2.022081",
  coordonnees_finales: { lat: 49.02959, lon: 2.022081 },
  region: "Île-de-France"
};

const NATIONAL_SCENE: RawSmacRecord = {
  structure: "Scène Nationale",
  nom1: "Théâtre Jean Lurçat - Scène nationale",
  nom2: null,
  adresse1: "Avenue des Lissiers",
  adresse2: "BP 11",
  cp: 23200,
  ville: "AUBUSSON",
  longitude: null,
  latitude: null,
  coordonnees_geoloc: null,
  coordonnees_ban: "45.95457, 2.170185",
  coordonnees_finales: { lat: 45.954686, lon: 2.168553 },
  region: "Nouvelle-Aquitaine"
};

const OPERA: RawSmacRecord = { structure: "Opéra en région", nom1: "Opéra de Test", ville: "PARIS" };
const FRAC: RawSmacRecord = { structure: "FRAC", nom1: "FRAC de Test", ville: "LILLE" };

afterEach(() => {
  resetSmacDatasetCache();
  vi.restoreAllMocks();
});

describe("classifySmacStatus", () => {
  it("accepts the exact labelled SMAC value", () => {
    expect(classifySmacStatus("SMAC")).toBe("labelled");
  });

  it("accepts the pending-labelling variant", () => {
    expect(classifySmacStatus("SMAC en cours de labellisation")).toBe("pending");
  });

  it("tolerates case, accents and surrounding whitespace", () => {
    expect(classifySmacStatus("  smac  ")).toBe("labelled");
    expect(classifySmacStatus("SMAC EN COURS DE LABELLISATION")).toBe("pending");
  });

  it("rejects a national theatre", () => {
    expect(classifySmacStatus("Scène Nationale")).toBeNull();
  });

  it("rejects an opera", () => {
    expect(classifySmacStatus("Opéra en région")).toBeNull();
  });

  it("rejects unrelated structures", () => {
    expect(classifySmacStatus("FRAC")).toBeNull();
    expect(classifySmacStatus("Centre chorégraphique national")).toBeNull();
  });

  it("never matches on a substring of an unrelated value", () => {
    expect(classifySmacStatus("Centre national des arts de la rue (SMAC-adjacent)")).toBeNull();
  });

  it("returns null for missing/empty values", () => {
    expect(classifySmacStatus(null)).toBeNull();
    expect(classifySmacStatus(undefined)).toBeNull();
    expect(classifySmacStatus("")).toBeNull();
  });
});

describe("isSmacDiscoveryEnabled", () => {
  it("defaults to enabled for this free, no-auth source", () => {
    expect(isSmacDiscoveryEnabled({})).toBe(true);
  });

  it("is disabled only when explicitly set to false", () => {
    expect(isSmacDiscoveryEnabled({ ENABLE_SMAC_DISCOVERY: "false" })).toBe(false);
    expect(isSmacDiscoveryEnabled({ ENABLE_SMAC_DISCOVERY: "true" })).toBe(true);
  });
});

describe("discoverSmacVenuesFromMinistryOfCultureDataset", () => {
  it("never fetches when explicitly disabled via ENABLE_SMAC_DISCOVERY=false", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([ROCK_SCHOOL]));
    const result = await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl, env: { ENABLE_SMAC_DISCOVERY: "false" } });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.candidates).toEqual([]);
  });


  it("filters to SMAC records only and maps them to venue candidates", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([ROCK_SCHOOL, PENDING_SMAC, NATIONAL_SCENE, OPERA, FRAC]));

    const result = await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl });

    expect(result.totalDatasetRecords).toBe(5);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["Rock School Barbey", "Le Forum"]);
    expect(result.warnings).toEqual([]);
  });

  it("marks every candidate as a smac venue entity with the official source and no invented contact fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([ROCK_SCHOOL]));
    const result = await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl });

    const candidate = result.candidates[0];
    expect(candidate.entityType).toBe("smac");
    expect(candidate.city).toBe("BORDEAUX");
    expect(candidate.address).toBe("18 Cours Barbey, 33800, BORDEAUX");
    expect(candidate.country).toBe("France");
    expect(candidate.latitude).toBeCloseTo(44.8355);
    expect(candidate.longitude).toBeCloseTo(-0.5654);
    expect(candidate.websiteUrl).toBeUndefined();
    expect(candidate.phone).toBeUndefined();
    expect(candidate.programmeUrl).toBeUndefined();
    expect(candidate.sourceRecords).toHaveLength(1);
    expect(candidate.sourceRecords[0].sourceType).toBe("official_open_data");
    expect(candidate.sourceRecords[0].sourceUrl).toBe(SMAC_DATASET_PAGE_URL);
    expect(candidate.sourceRecords[0].reliabilityScore).toBeGreaterThanOrEqual(0.9);
  });

  it("gives a labelled SMAC's official status enough activity evidence to qualify on its own", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([ROCK_SCHOOL]));
    const result = await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl });

    expect(hasQualifyingActivityEvidence(result.candidates[0].activityEvidence)).toBe(true);
  });

  it("falls back to parsing coordonnees_ban when coordonnees_finales is absent", async () => {
    const record: RawSmacRecord = { ...ROCK_SCHOOL, coordonnees_finales: null };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([record]));
    const result = await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl });

    expect(result.candidates[0].latitude).toBeCloseTo(44.8355);
    expect(result.candidates[0].longitude).toBeCloseTo(-0.5654);
  });

  it("zero-pads a postal code that starts with 0", async () => {
    const record: RawSmacRecord = { ...ROCK_SCHOOL, cp: 1000 };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([record]));
    const result = await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl });

    expect(result.candidates[0].address).toContain("01000");
  });

  it("skips a malformed record (missing name) without failing the whole search", async () => {
    const malformed: RawSmacRecord = { structure: "SMAC", nom1: null };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([malformed, ROCK_SCHOOL]));
    const result = await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].name).toBe("Rock School Barbey");
  });

  it("returns an empty, warned result on a dataset request timeout/rejection, never throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(null, false, 503));
    const result = await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl });

    expect(result.candidates).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns an empty, warned result on a network failure, never throwing", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl });

    expect(result.candidates).toEqual([]);
    expect(result.warnings[0]).toContain("network down");
  });

  it("returns an empty, warned result on invalid JSON, never throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      }
    } as unknown as Response);
    const result = await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl });

    expect(result.candidates).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns an empty, warned result when the response body is not an array", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ notAnArray: true }));
    const result = await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl });

    expect(result.candidates).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("fetches the dataset at most once across multiple calls within the cache TTL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([ROCK_SCHOOL]));
    const cache = new TtlCache<string, RawSmacRecord[]>(60_000);

    await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl, cache });
    await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl, cache });
    await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl, cache });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(SMAC_DATASET_JSON_URL, expect.objectContaining({ method: "GET" }));
  });
});

describe("filterSmacCandidatesByLocation", () => {
  async function candidatesFor(records: RawSmacRecord[]) {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(records));
    const result = await discoverSmacVenuesFromMinistryOfCultureDataset({ fetchImpl });
    return result.candidates;
  }

  it("includes a SMAC inside the selected radius and sorts nearest-first", async () => {
    const candidates = await candidatesFor([ROCK_SCHOOL, PENDING_SMAC]);
    const filtered = filterSmacCandidatesByLocation(candidates, "Bordeaux", 50);

    expect(filtered.matchMode).toBe("distance");
    expect(filtered.candidates).toHaveLength(1);
    expect(filtered.candidates[0].candidate.name).toBe("Rock School Barbey");
    expect(filtered.candidates[0].distanceKm).not.toBeNull();
  });

  it("excludes a SMAC outside the selected radius", async () => {
    const candidates = await candidatesFor([PENDING_SMAC]);
    const filtered = filterSmacCandidatesByLocation(candidates, "Bordeaux", 50);

    expect(filtered.candidates).toHaveLength(0);
  });

  it("returns the full national set for an explicit nationwide France search", async () => {
    const candidates = await candidatesFor([ROCK_SCHOOL, PENDING_SMAC]);
    const filtered = filterSmacCandidatesByLocation(candidates, "France");

    expect(filtered.matchMode).toBe("nationwide");
    expect(filtered.candidates).toHaveLength(2);
  });

  it("falls back to normalized city matching when the location has no known coordinates", async () => {
    const candidates = await candidatesFor([ROCK_SCHOOL, PENDING_SMAC]);
    const filtered = filterSmacCandidatesByLocation(candidates, "Vauréal");

    expect(filtered.matchMode).toBe("text_fallback");
    expect(filtered.candidates).toHaveLength(1);
    expect(filtered.candidates[0].candidate.name).toBe("Le Forum");
  });

  it("falls back to normalized region matching when the city doesn't match", async () => {
    const candidates = await candidatesFor([ROCK_SCHOOL]);
    const filtered = filterSmacCandidatesByLocation(candidates, "Nouvelle-Aquitaine");

    expect(filtered.matchMode).toBe("text_fallback");
    expect(filtered.candidates).toHaveLength(1);
  });
});
