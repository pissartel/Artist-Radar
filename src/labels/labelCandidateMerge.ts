import type { LabelEvidence, RawLabelCandidate } from "./types.js";

// Issue #195 step 8: merges label candidates coming from the web-search
// discovery (PR #181), MusicBrainz, Discogs and official-site/Bandcamp
// enrichment. Priority order for treating two candidates as the same label:
//   1. a shared stable provider ID (MusicBrainz or Discogs);
//   2. a shared normalized official domain;
//   3. an exact official URL match;
//   4. normalized name + country;
//   5. normalized name + an overlapping release or roster artist.
// Every merge concatenates evidence/links/sources instead of dropping one
// side — "do not merge labels solely because they have similar names" is
// enforced by never using name alone as a key.

const AGGREGATOR_OR_PLATFORM_HOSTS = new Set([
  "musicbrainz.org",
  "discogs.com",
  "www.discogs.com",
  "google.com",
  "www.google.com",
  "facebook.com",
  "www.facebook.com",
  "wikipedia.org",
  "en.wikipedia.org",
  "twitter.com",
  "x.com"
]);

export function mergeAndDeduplicateLabelCandidates(candidates: RawLabelCandidate[]): RawLabelCandidate[] {
  const merged: RawLabelCandidate[] = [];
  const keyToIndex = new Map<string, number>();

  for (const candidate of candidates) {
    const keys = computeDedupeKeys(candidate);
    let targetIndex = -1;
    for (const key of keys) {
      const existing = keyToIndex.get(key);
      if (existing !== undefined) {
        targetIndex = existing;
        break;
      }
    }

    if (targetIndex === -1) {
      merged.push(candidate);
      targetIndex = merged.length - 1;
    } else {
      merged[targetIndex] = mergeCandidates(merged[targetIndex]!, candidate);
    }

    for (const key of keys) {
      keyToIndex.set(key, targetIndex);
    }
  }

  return merged;
}

function computeDedupeKeys(candidate: RawLabelCandidate): string[] {
  const keys: string[] = [];

  if (candidate.externalIds?.musicBrainzId) {
    keys.push(`mbid:${candidate.externalIds.musicBrainzId}`);
  }
  if (candidate.externalIds?.discogsId) {
    keys.push(`discogsid:${candidate.externalIds.discogsId}`);
  }

  // Domain-level matching is restricted to candidates that already carry
  // structured provenance (MusicBrainz/Discogs/official-site/Bandcamp).
  // Plain web-search snippets never contribute a domain key: two unrelated
  // labels can legitimately share a domain in test/placeholder data (and,
  // in the real world, a hosting platform), so domain alone must not merge
  // candidates that have no other corroborating evidence.
  if (hasStructuredProvenance(candidate)) {
    const domain = extractMergeableDomain(candidate.url);
    if (domain) {
      keys.push(`domain:${domain}`);
    }
  }

  if (candidate.url) {
    keys.push(`url:${normalizeUrl(candidate.url)}`);
  }

  const normalizedName = normalizeName(candidate.name);
  if (candidate.country) {
    keys.push(`name-country:${normalizedName}|${candidate.country.trim().toLowerCase()}`);
  }

  const associatedArtists = new Set(
    (candidate.evidence ?? []).map((entry) => entry.similarArtistName).filter((value): value is string => Boolean(value))
  );
  for (const artistName of associatedArtists) {
    keys.push(`name-artist:${normalizedName}|${normalizeName(artistName)}`);
  }

  const releaseIds = new Set((candidate.evidence ?? []).map((entry) => entry.releaseId).filter((value): value is string => Boolean(value)));
  for (const releaseId of releaseIds) {
    keys.push(`name-release:${normalizedName}|${releaseId}`);
  }

  return keys;
}

function mergeCandidates(a: RawLabelCandidate, b: RawLabelCandidate): RawLabelCandidate {
  return {
    name: pickPreferredName(a, b),
    url: pickPreferredUrl(a, b),
    sourceName: mergeSourceNames(a.sourceName, b.sourceName),
    strategy: a.strategy,
    text: mergeTexts(a.text, b.text),
    links: [...new Set([...a.links, ...b.links])],
    confidence: Math.max(a.confidence, b.confidence),
    country: a.country ?? b.country ?? null,
    externalIds: mergeExternalIds(a.externalIds, b.externalIds),
    evidence: mergeEvidence(a.evidence, b.evidence)
  };
}

function mergeExternalIds(
  a: RawLabelCandidate["externalIds"],
  b: RawLabelCandidate["externalIds"]
): RawLabelCandidate["externalIds"] {
  if (!a && !b) {
    return undefined;
  }
  return {
    musicBrainzId: a?.musicBrainzId ?? b?.musicBrainzId,
    discogsId: a?.discogsId ?? b?.discogsId
  };
}

function mergeEvidence(a: LabelEvidence[] | undefined, b: LabelEvidence[] | undefined): LabelEvidence[] | undefined {
  const combined = [...(a ?? []), ...(b ?? [])];
  if (combined.length === 0) {
    return undefined;
  }

  const seen = new Set<string>();
  const deduped: LabelEvidence[] = [];
  for (const entry of combined) {
    const key = `${entry.provider}|${entry.sourceUrl ?? ""}|${entry.releaseId ?? ""}|${entry.similarArtistName ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function mergeTexts(a: string, b: string): string {
  if (!b) {
    return a;
  }
  if (!a) {
    return b;
  }
  if (a.includes(b)) {
    return a;
  }
  if (b.includes(a)) {
    return b;
  }
  return `${a} ${b}`;
}

function mergeSourceNames(a: string, b: string): string {
  const names = new Set(
    [...a.split(","), ...b.split(",")].map((name) => name.trim()).filter((name) => name.length > 0)
  );
  return [...names].join(",");
}

const GENERIC_CANDIDATE_NAMES = new Set(["label discovery result", "unknown label"]);

function pickPreferredName(a: RawLabelCandidate, b: RawLabelCandidate): string {
  if (GENERIC_CANDIDATE_NAMES.has(a.name.trim().toLowerCase()) && !GENERIC_CANDIDATE_NAMES.has(b.name.trim().toLowerCase())) {
    return b.name;
  }
  return a.name;
}

function pickPreferredUrl(a: RawLabelCandidate, b: RawLabelCandidate): string | null {
  if (isOfficialLookingHost(a.url)) {
    return a.url;
  }
  if (isOfficialLookingHost(b.url)) {
    return b.url;
  }
  return a.url ?? b.url;
}

function isOfficialLookingHost(url: string | null): boolean {
  if (!url) {
    return false;
  }
  try {
    const host = new URL(url).host.toLowerCase().replace(/^www\./, "");
    return !AGGREGATOR_OR_PLATFORM_HOSTS.has(host) && !host.endsWith("bandcamp.com");
  } catch {
    return false;
  }
}

function hasStructuredProvenance(candidate: RawLabelCandidate): boolean {
  if (candidate.externalIds?.musicBrainzId || candidate.externalIds?.discogsId) {
    return true;
  }
  return (candidate.evidence ?? []).some((entry) =>
    entry.provider === "musicbrainz" || entry.provider === "discogs" || entry.provider === "official_website" || entry.provider === "bandcamp"
  );
}

function extractMergeableDomain(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    const host = new URL(url).host.toLowerCase().replace(/^www\./, "");
    // Aggregator/platform domains are shared by many different labels, so
    // they must never be used as a merge key on their own.
    if (AGGREGATOR_OR_PLATFORM_HOSTS.has(host) || host.endsWith("bandcamp.com")) {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host.toLowerCase().replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
