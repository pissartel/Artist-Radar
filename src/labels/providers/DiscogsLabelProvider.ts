import { debugLog, warnLog } from "../../utils/logger.js";
import { TtlCache } from "../../utils/ttlCache.js";
import type { LabelEvidence, RawLabelCandidate } from "../types.js";

// Issue #195: Discogs is an optional consolidation/validation step on top of
// candidates already discovered by MusicBrainz or web search — it never
// discovers labels on its own and must stay fully failure-safe (unavailable,
// rate-limited or unconfigured Discogs can never break label discovery).

type FetchLike = typeof fetch;

export interface DiscogsLabelProviderEnv {
  DISCOGS_TOKEN?: string;
  ENABLE_DISCOGS_LABEL_ENRICHMENT?: string;
}

// Discogs stays opt-in by requiring a token; once configured it behaves like
// the other "enabled unless explicitly disabled" providers in this codebase.
export function isDiscogsLabelEnrichmentEnabled(env: DiscogsLabelProviderEnv = process.env): boolean {
  return Boolean(env.DISCOGS_TOKEN?.trim()) && env.ENABLE_DISCOGS_LABEL_ENRICHMENT !== "false";
}

interface DiscogsSearchResult {
  id?: number;
  title?: string;
  type?: string;
}

interface DiscogsSearchResponse {
  results?: DiscogsSearchResult[];
}

interface DiscogsLabelApi {
  id?: number;
  name?: string;
  profile?: string | null;
  parent_label?: { name?: string } | null;
  sublabels?: Array<{ name?: string }>;
  urls?: string[];
}

export interface DiscogsLabelMetadata {
  discogsId: number;
  name: string;
  profile: string | null;
  parentLabelName: string | null;
  sublabelNames: string[];
  urls: string[];
  sourceUrl: string;
}

export interface DiscogsLabelProviderOptions {
  env?: DiscogsLabelProviderEnv;
  fetchImpl?: FetchLike;
  maxEnrichments?: number;
  timeoutMs?: number;
  labelCache?: TtlCache<string, DiscogsLabelMetadata | null>;
}

export interface DiscogsEnrichmentResult {
  candidates: RawLabelCandidate[];
  warnings: string[];
  metadata: {
    attempted: number;
    enriched: number;
    ambiguousRejected: number;
    skippedNoMatch: number;
  };
}

const DEFAULT_MAX_ENRICHMENTS = 8;
const DEFAULT_TIMEOUT_MS = 10_000;
const DISCOGS_USER_AGENT = "ArtistRadar/0.1.0 (+https://github.com/pissartel/Artist-Radar)";

const defaultLabelCache = new TtlCache<string, DiscogsLabelMetadata | null>(24 * 60 * 60 * 1000);

export function resetDiscogsLabelProviderCache(): void {
  defaultLabelCache.clear();
}

export async function enrichLabelCandidatesWithDiscogs(
  candidates: RawLabelCandidate[],
  options: DiscogsLabelProviderOptions = {}
): Promise<DiscogsEnrichmentResult> {
  const env = options.env ?? process.env;
  const emptyMetadata = { attempted: 0, enriched: 0, ambiguousRejected: 0, skippedNoMatch: 0 };

  if (!isDiscogsLabelEnrichmentEnabled(env)) {
    return { candidates, warnings: [], metadata: emptyMetadata };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const token = env.DISCOGS_TOKEN!.trim();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const labelCache = options.labelCache ?? defaultLabelCache;
  const maxEnrichments = options.maxEnrichments ?? DEFAULT_MAX_ENRICHMENTS;

  const warnings: string[] = [];
  let attempted = 0;
  let enriched = 0;
  let ambiguousRejected = 0;
  let skippedNoMatch = 0;

  const enrichedCandidates: RawLabelCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.externalIds?.discogsId || attempted >= maxEnrichments) {
      enrichedCandidates.push(candidate);
      continue;
    }

    attempted += 1;
    try {
      const match = await findDiscogsLabelMatch(candidate.name, token, fetchImpl, timeoutMs);
      if (!match) {
        skippedNoMatch += 1;
        enrichedCandidates.push(candidate);
        continue;
      }
      if (match.ambiguous) {
        ambiguousRejected += 1;
        debugLog("labels", "[discogs] ambiguous label match rejected", { candidateName: candidate.name });
        enrichedCandidates.push(candidate);
        continue;
      }

      const metadata = await labelCache.getOrCreate(String(match.discogsId), () =>
        fetchDiscogsLabelDetails(match.discogsId, token, fetchImpl, timeoutMs)
      );
      if (!metadata) {
        skippedNoMatch += 1;
        enrichedCandidates.push(candidate);
        continue;
      }

      enriched += 1;
      enrichedCandidates.push(mergeDiscogsMetadata(candidate, metadata));
    } catch (error) {
      const message = errorMessage(error);
      warnings.push(`Discogs enrichment failed for "${candidate.name}": ${message}.`);
      warnLog("labels", "[discogs] enrichment failed", { candidateName: candidate.name, message });
      enrichedCandidates.push(candidate);
    }
  }

  debugLog("labels", "[discogs] enrichment summary", { attempted, enriched, ambiguousRejected, skippedNoMatch });

  return {
    candidates: enrichedCandidates,
    warnings,
    metadata: { attempted, enriched, ambiguousRejected, skippedNoMatch }
  };
}

async function findDiscogsLabelMatch(
  name: string,
  token: string,
  fetchImpl: FetchLike,
  timeoutMs: number
): Promise<{ discogsId: number; ambiguous: boolean } | null> {
  const url = new URL("https://api.discogs.com/database/search");
  url.searchParams.set("type", "label");
  url.searchParams.set("q", name);
  url.searchParams.set("token", token);

  const response = await fetchWithTimeout(url.toString(), fetchImpl, timeoutMs);
  if (!response.ok) {
    if (response.status === 429) {
      warnLog("labels", "[discogs] rate limited", { status: 429 });
    }
    return null;
  }

  const data = (await response.json()) as DiscogsSearchResponse;
  const normalizedTarget = normalizeLabelName(name);
  // Discogs disambiguates same-named labels with a "(2)", "(3)" suffix on
  // title; stripping it before comparing means two distinct real labels that
  // only differ by that suffix are correctly treated as ambiguous rather
  // than silently picking the first one (issue #195: never guess).
  const exactMatches = (data.results ?? []).filter(
    (result) => Boolean(result.id) && normalizeLabelName(result.title ?? "") === normalizedTarget
  );

  if (exactMatches.length === 0) {
    return null;
  }
  if (exactMatches.length > 1) {
    return { discogsId: exactMatches[0]!.id!, ambiguous: true };
  }
  return { discogsId: exactMatches[0]!.id!, ambiguous: false };
}

async function fetchDiscogsLabelDetails(
  discogsId: number,
  token: string,
  fetchImpl: FetchLike,
  timeoutMs: number
): Promise<DiscogsLabelMetadata | null> {
  const url = new URL(`https://api.discogs.com/labels/${discogsId}`);
  url.searchParams.set("token", token);

  const response = await fetchWithTimeout(url.toString(), fetchImpl, timeoutMs);
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as DiscogsLabelApi;
  if (!data.id || !data.name) {
    return null;
  }

  return {
    discogsId: data.id,
    name: data.name,
    profile: data.profile?.trim() || null,
    parentLabelName: data.parent_label?.name ?? null,
    sublabelNames: (data.sublabels ?? []).map((sublabel) => sublabel.name).filter((value): value is string => Boolean(value)),
    urls: (data.urls ?? []).filter((value): value is string => Boolean(value)),
    sourceUrl: `https://www.discogs.com/label/${data.id}`
  };
}

function mergeDiscogsMetadata(candidate: RawLabelCandidate, metadata: DiscogsLabelMetadata): RawLabelCandidate {
  const textParts = [candidate.text];
  if (metadata.profile) {
    textParts.push(metadata.profile);
  }
  if (metadata.parentLabelName) {
    textParts.push(`Parent label: ${metadata.parentLabelName}.`);
  }
  if (metadata.sublabelNames.length > 0) {
    textParts.push(`Sublabels: ${metadata.sublabelNames.join(", ")}.`);
  }

  const evidenceEntry: LabelEvidence = {
    provider: "discogs",
    sourceUrl: metadata.sourceUrl,
    confidence: 0.7
  };

  return {
    ...candidate,
    text: textParts.filter(Boolean).join(" "),
    links: [...new Set([...candidate.links, ...metadata.urls, metadata.sourceUrl])],
    externalIds: { ...candidate.externalIds, discogsId: metadata.discogsId },
    evidence: [...(candidate.evidence ?? []), evidenceEntry]
  };
}

function normalizeLabelName(name: string): string {
  return name.trim().toLowerCase().replace(/\s*\(\d+\)\s*$/, "");
}

async function fetchWithTimeout(url: string, fetchImpl: FetchLike, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Discogs request timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetchImpl(url, {
      headers: { "User-Agent": DISCOGS_USER_AGENT },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
