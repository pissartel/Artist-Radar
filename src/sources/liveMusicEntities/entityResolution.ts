import { normalizeKey, normalizeVenueName } from "../../utils/venueNameNormalization.js";
import { isWithinRadiusKm } from "./geoDiscoveryConfig.js";
import type { LiveMusicEntityCandidate } from "./types.js";

const COORDINATE_MATCH_RADIUS_KM = 0.15;

/**
 * Match keys for a candidate, per issue #183's entity-resolution
 * requirement: normalised name, website hostname, postal address,
 * coordinates, city, phone number. Two candidates sharing *any* key are
 * treated as the same real-world entity.
 */
export function computeLiveMusicEntityMatchKeys(candidate: LiveMusicEntityCandidate): string[] {
  const keys: string[] = [];
  const city = candidate.city ?? null;

  keys.push(`name:${normalizeVenueName(candidate.name, city)}|${normalizeKey(city ?? "")}`);

  const hostname = safeHostname(candidate.websiteUrl);
  if (hostname) {
    keys.push(`host:${hostname}`);
  }

  if (candidate.address) {
    keys.push(`address:${normalizeKey(candidate.address)}`);
  }

  if (candidate.phone) {
    keys.push(`phone:${normalizePhone(candidate.phone)}`);
  }

  return keys;
}

interface MergeGroup {
  keys: Set<string>;
  candidates: LiveMusicEntityCandidate[];
}

/**
 * Merges duplicate candidates discovered across different adapters into one
 * record per real-world entity (acceptance criterion: "Duplicate entities
 * from different sources are merged"). Grouping is transitive: candidate A
 * and C merge if A shares a key with B and B shares a key with C, even
 * without a direct A/C match. Coordinate proximity is checked separately
 * since it is a continuous key rather than an exact string match.
 */
export function mergeLiveMusicEntityCandidates(
  candidates: LiveMusicEntityCandidate[]
): LiveMusicEntityCandidate[] {
  const groups: MergeGroup[] = [];

  for (const candidate of candidates) {
    const keys = new Set(computeLiveMusicEntityMatchKeys(candidate));
    const matchingGroups = groups.filter(
      (group) =>
        [...keys].some((key) => group.keys.has(key)) ||
        group.candidates.some((existing) => candidatesShareCoordinates(existing, candidate))
    );

    if (matchingGroups.length === 0) {
      groups.push({ keys, candidates: [candidate] });
      continue;
    }

    const [primaryGroup, ...duplicateGroups] = matchingGroups;
    primaryGroup.candidates.push(candidate);
    for (const key of keys) {
      primaryGroup.keys.add(key);
    }
    for (const duplicateGroup of duplicateGroups) {
      primaryGroup.candidates.push(...duplicateGroup.candidates);
      for (const key of duplicateGroup.keys) {
        primaryGroup.keys.add(key);
      }
      groups.splice(groups.indexOf(duplicateGroup), 1);
    }
  }

  return groups.map((group) => mergeCandidateGroup(group.candidates));
}

function candidatesShareCoordinates(a: LiveMusicEntityCandidate, b: LiveMusicEntityCandidate): boolean {
  if (a.latitude === undefined || a.longitude === undefined || b.latitude === undefined || b.longitude === undefined) {
    return false;
  }
  return isWithinRadiusKm(
    { latitude: a.latitude, longitude: a.longitude },
    { latitude: b.latitude, longitude: b.longitude },
    COORDINATE_MATCH_RADIUS_KM
  );
}

function mergeCandidateGroup(group: LiveMusicEntityCandidate[]): LiveMusicEntityCandidate {
  const primary = pickCanonicalCandidate(group);

  const externalIds = Object.assign({}, ...group.map((candidate) => candidate.externalIds));
  const sourceRecords = dedupeBySourceUrl(group.flatMap((candidate) => candidate.sourceRecords));
  const activityEvidence = dedupeEvidence(group.flatMap((candidate) => candidate.activityEvidence));

  return {
    ...primary,
    externalIds,
    sourceRecords,
    activityEvidence
  };
}

function pickCanonicalCandidate(group: LiveMusicEntityCandidate[]): LiveMusicEntityCandidate {
  return [...group].sort((a, b) => bestReliability(b) - bestReliability(a))[0];
}

function bestReliability(candidate: LiveMusicEntityCandidate): number {
  return Math.max(0, ...candidate.sourceRecords.map((record) => record.reliabilityScore));
}

function dedupeBySourceUrl<T extends { sourceUrl: string }>(records: T[]): T[] {
  const bySourceUrl = new Map(records.map((record) => [record.sourceUrl, record]));
  return [...bySourceUrl.values()];
}

function dedupeEvidence<T extends { sourceUrl: string; kind: string; observedAt: string | null }>(records: T[]): T[] {
  const seen = new Map<string, T>();
  for (const record of records) {
    seen.set(`${record.kind}|${record.sourceUrl}|${record.observedAt ?? ""}`, record);
  }
  return [...seen.values()];
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function safeHostname(url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
