import { fetchMusicBrainzJson, type MusicBrainzEnv } from "../../services/musicBrainzService.js";
import { TtlCache } from "../../utils/ttlCache.js";
import { debugLog, warnLog } from "../../utils/logger.js";
import type { SimilarArtist } from "../../schemas.js";
import type { LabelEvidence, LabelSearchInput, RawLabelCandidate } from "../types.js";

// Issue #195 target flow: similar artists -> MusicBrainz artist matching ->
// releases credited to that artist -> labels credited on those releases ->
// label metadata. Every candidate keeps the similar-artist/release
// provenance that produced it so scoreLabelCompatibility.ts's explanation
// can cite concrete evidence instead of a generic web snippet.

type FetchLike = typeof fetch;

export interface MusicBrainzLabelProviderEnv extends MusicBrainzEnv {
  ENABLE_MUSICBRAINZ_LABEL_DISCOVERY?: string;
}

// Issue #195: "MusicBrainz should be enabled by default when the required
// User-Agent configuration is available." An explicit flag always wins;
// absent that, "available" means an operator actually configured an
// identifying User-Agent (MUSICBRAINZ_USER_AGENT or the shared
// APP_USER_AGENT) — not merely that getMusicBrainzUserAgent() has a
// hardcoded fallback string to fall back on. This keeps a fresh/unconfigured
// environment (a clean clone, a test run) fully offline by default, the same
// way the web-search providers stay off without an API key, instead of
// silently making real MusicBrainz requests the moment similar artists
// exist.
export function isMusicBrainzLabelDiscoveryEnabled(env: MusicBrainzLabelProviderEnv = process.env): boolean {
  if (env.ENABLE_MUSICBRAINZ_LABEL_DISCOVERY === "false") {
    return false;
  }
  if (env.ENABLE_MUSICBRAINZ_LABEL_DISCOVERY === "true") {
    return true;
  }
  return Boolean(env.MUSICBRAINZ_USER_AGENT?.trim() || env.APP_USER_AGENT?.trim());
}

export interface MusicBrainzArtistMatch {
  musicBrainzId: string;
  name: string;
  confidence: number;
}

interface MusicBrainzArtistSearchApi {
  id?: string;
  name?: string;
  country?: string | null;
  type?: string | null;
  disambiguation?: string | null;
  score?: number | string | null;
  aliases?: Array<{ name?: string | null }>;
}

interface MusicBrainzArtistSearchResponse {
  artists?: MusicBrainzArtistSearchApi[];
}

interface MusicBrainzLabelInfoApi {
  label?: { id?: string; name?: string };
}

interface MusicBrainzReleaseApi {
  id?: string;
  title?: string;
  date?: string | null;
  "label-info"?: MusicBrainzLabelInfoApi[];
}

interface MusicBrainzReleaseBrowseResponse {
  releases?: MusicBrainzReleaseApi[];
}

interface MusicBrainzLabelLookupApi {
  id?: string;
  name?: string;
  country?: string | null;
  area?: { name?: string | null } | string | null;
  type?: string | null;
  disambiguation?: string | null;
  "life-span"?: { begin?: string | null; end?: string | null; ended?: boolean | null } | null;
  relations?: Array<{ type?: string; url?: { resource?: string } }>;
}

export interface MusicBrainzLabelMetadata {
  musicBrainzId: string;
  name: string;
  country: string | null;
  city: string | null;
  labelType: string | null;
  beginDate: string | null;
  endDate: string | null;
  ended: boolean;
  disambiguation: string | null;
  officialUrls: string[];
  bandcampUrls: string[];
  sourceUrl: string;
}

interface LabelEvidenceAccumulator {
  labelId: string;
  labelName: string;
  evidence: LabelEvidence[];
  releaseDates: string[];
}

export interface MusicBrainzLabelDiscoveryOptions {
  env?: MusicBrainzLabelProviderEnv;
  fetchImpl?: FetchLike;
  maxSimilarArtists?: number;
  maxReleasesPerArtist?: number;
  maxLabelsPerArtist?: number;
  artistMatchCache?: TtlCache<string, MusicBrainzArtistMatch | null>;
  releaseCache?: TtlCache<string, MusicBrainzReleaseSummary[]>;
  labelCache?: TtlCache<string, MusicBrainzLabelMetadata | null>;
}

export interface MusicBrainzLabelDiscoveryResult {
  candidates: RawLabelCandidate[];
  warnings: string[];
  metadata: {
    similarArtistsProcessed: number;
    artistsResolved: number;
    ambiguousMatchesRejected: number;
    releasesInspected: number;
    labelsFound: number;
  };
}

interface MusicBrainzReleaseSummary {
  releaseId: string;
  releaseTitle: string;
  releaseDate: string | null;
  labelCredits: Array<{ labelId: string; labelName: string | null }>;
}

const DEFAULT_MAX_SIMILAR_ARTISTS = 5;
const DEFAULT_MAX_RELEASES_PER_ARTIST = 8;
const DEFAULT_MAX_LABELS_PER_ARTIST = 6;
const MIN_CONFIDENT_MATCH = 0.55;
const AMBIGUITY_MARGIN = 0.05;

// Module-level default caches so repeated calls within the same process
// (e.g. across similar artists sharing a label, or repeated pipeline runs in
// the same server process) reuse lookups (issue #195: "avoid repeatedly
// fetching the same label or release for different similar artists").
const defaultArtistMatchCache = new TtlCache<string, MusicBrainzArtistMatch | null>(6 * 60 * 60 * 1000);
const defaultReleaseCache = new TtlCache<string, MusicBrainzReleaseSummary[]>(6 * 60 * 60 * 1000);
const defaultLabelCache = new TtlCache<string, MusicBrainzLabelMetadata | null>(24 * 60 * 60 * 1000);

export function resetMusicBrainzLabelProviderCaches(): void {
  defaultArtistMatchCache.clear();
  defaultReleaseCache.clear();
  defaultLabelCache.clear();
}

export async function discoverLabelCandidatesFromMusicBrainz(
  input: LabelSearchInput,
  options: MusicBrainzLabelDiscoveryOptions = {}
): Promise<MusicBrainzLabelDiscoveryResult> {
  const env = options.env ?? (process.env as MusicBrainzLabelProviderEnv);
  const emptyResult: MusicBrainzLabelDiscoveryResult = {
    candidates: [],
    warnings: [],
    metadata: { similarArtistsProcessed: 0, artistsResolved: 0, ambiguousMatchesRejected: 0, releasesInspected: 0, labelsFound: 0 }
  };

  if (!isMusicBrainzLabelDiscoveryEnabled(env)) {
    return emptyResult;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const maxReleasesPerArtist = options.maxReleasesPerArtist ?? DEFAULT_MAX_RELEASES_PER_ARTIST;
  const maxLabelsPerArtist = options.maxLabelsPerArtist ?? DEFAULT_MAX_LABELS_PER_ARTIST;
  const artistMatchCache = options.artistMatchCache ?? defaultArtistMatchCache;
  const releaseCache = options.releaseCache ?? defaultReleaseCache;
  const labelCache = options.labelCache ?? defaultLabelCache;

  const similarArtists = (input.similarArtists ?? [])
    .filter((artist) => artist.name.trim().length > 0)
    .slice(0, options.maxSimilarArtists ?? DEFAULT_MAX_SIMILAR_ARTISTS);

  const warnings: string[] = [];
  let ambiguousMatchesRejected = 0;
  let artistsResolved = 0;
  let releasesInspected = 0;
  const evidenceByLabelId = new Map<string, LabelEvidenceAccumulator>();

  for (const similarArtist of similarArtists) {
    try {
      const match = await artistMatchCache.getOrCreate(normalizeText(similarArtist.name), () =>
        matchMusicBrainzArtist(similarArtist, env, fetchImpl)
      );

      if (!match) {
        ambiguousMatchesRejected += 1;
        continue;
      }
      artistsResolved += 1;

      const releases = await releaseCache.getOrCreate(match.musicBrainzId, () =>
        fetchArtistReleasesWithLabels(match.musicBrainzId, env, fetchImpl, maxReleasesPerArtist)
      );
      releasesInspected += releases.length;

      let labelsCreditedForArtist = 0;
      for (const release of releases) {
        if (labelsCreditedForArtist >= maxLabelsPerArtist) {
          break;
        }
        for (const credit of release.labelCredits) {
          if (labelsCreditedForArtist >= maxLabelsPerArtist) {
            break;
          }
          const accumulator = evidenceByLabelId.get(credit.labelId) ?? {
            labelId: credit.labelId,
            labelName: credit.labelName ?? "Unknown label",
            evidence: [],
            releaseDates: []
          };
          accumulator.evidence.push({
            provider: "musicbrainz",
            sourceUrl: `https://musicbrainz.org/release/${encodeURIComponent(release.releaseId)}`,
            similarArtistName: similarArtist.name,
            similarArtistId: similarArtist.spotifyId ?? undefined,
            releaseTitle: release.releaseTitle,
            releaseId: release.releaseId,
            confidence: clamp01(match.confidence * 0.9)
          });
          if (release.releaseDate) {
            accumulator.releaseDates.push(release.releaseDate);
          }
          evidenceByLabelId.set(credit.labelId, accumulator);
          labelsCreditedForArtist += 1;
        }
      }
    } catch (error) {
      const message = errorMessage(error);
      warnings.push(`MusicBrainz label discovery failed for similar artist "${similarArtist.name}": ${message}.`);
      warnLog("labels", "[musicbrainz] artist processing failed", { artistName: similarArtist.name, message });
    }
  }

  const candidates: RawLabelCandidate[] = [];
  for (const accumulator of evidenceByLabelId.values()) {
    let metadata: MusicBrainzLabelMetadata | null = null;
    try {
      metadata = await labelCache.getOrCreate(accumulator.labelId, () => fetchLabelMetadata(accumulator.labelId, env, fetchImpl));
    } catch (error) {
      const message = errorMessage(error);
      warnings.push(`MusicBrainz label lookup failed for "${accumulator.labelName}": ${message}.`);
      warnLog("labels", "[musicbrainz] label lookup failed", { labelId: accumulator.labelId, message });
      // A failed metadata lookup must not drop otherwise-valid release
      // evidence (issue #195: one provider failure cannot break discovery);
      // fall through with a minimal candidate built from the release credit alone.
    }
    candidates.push(buildCandidateFromLabel(accumulator, metadata));
  }

  debugLog("labels", "[musicbrainz] discovery summary", {
    similarArtistsProcessed: similarArtists.length,
    artistsResolved,
    ambiguousMatchesRejected,
    releasesInspected,
    labelsFound: candidates.length
  });

  return {
    candidates,
    warnings,
    metadata: {
      similarArtistsProcessed: similarArtists.length,
      artistsResolved,
      ambiguousMatchesRejected,
      releasesInspected,
      labelsFound: candidates.length
    }
  };
}

/**
 * Resolves a similar artist to a MusicBrainz artist, scoring candidates on
 * name match, MusicBrainz's own relevance score, alias match and country
 * agreement (issue #195: "must not select the first search result blindly").
 * Returns null — rather than a low-confidence guess — when the top result
 * isn't clearly distinguishable from a same-named runner-up and there is no
 * corroborating signal (country/alias) to break the tie.
 */
export async function matchMusicBrainzArtist(
  artist: Pick<SimilarArtist, "name" | "country">,
  env: MusicBrainzLabelProviderEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<MusicBrainzArtistMatch | null> {
  const trimmedName = artist.name.trim();
  if (!trimmedName) {
    return null;
  }

  const url = new URL("https://musicbrainz.org/ws/2/artist");
  url.searchParams.set("query", `artist:"${trimmedName}"`);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "5");

  let data: MusicBrainzArtistSearchResponse;
  try {
    data = await fetchMusicBrainzJson<MusicBrainzArtistSearchResponse>(url.toString(), env, fetchImpl);
  } catch (error) {
    warnLog("labels", "[musicbrainz] artist search failed", { artistName: trimmedName, message: errorMessage(error) });
    return null;
  }

  const candidates = (data.artists ?? []).filter(
    (candidate): candidate is MusicBrainzArtistSearchApi & { id: string; name: string } => Boolean(candidate.id && candidate.name)
  );
  if (candidates.length === 0) {
    debugLog("labels", "[musicbrainz] no artist candidates", { artistName: trimmedName });
    return null;
  }

  const normalizedTarget = normalizeText(trimmedName);
  const scored = candidates
    .map((candidate) => ({ candidate, confidence: scoreArtistMatch(candidate, normalizedTarget, artist.country ?? null) }))
    .sort((left, right) => right.confidence - left.confidence);

  const best = scored[0]!;
  const runnerUp = scored[1];
  const bestName = normalizeText(best.candidate.name ?? "");
  const hasCountryCorroboration = Boolean(artist.country) && sameCountry(best.candidate.country, artist.country ?? null);

  const isAmbiguous =
    best.confidence < MIN_CONFIDENT_MATCH ||
    (Boolean(runnerUp) &&
      runnerUp!.confidence >= best.confidence - AMBIGUITY_MARGIN &&
      normalizeText(runnerUp!.candidate.name ?? "") === bestName &&
      !hasCountryCorroboration);

  if (isAmbiguous) {
    debugLog("labels", "[musicbrainz] ambiguous artist match rejected", {
      artistName: trimmedName,
      topCandidateId: best.candidate.id,
      topConfidence: best.confidence,
      runnerUpConfidence: runnerUp?.confidence ?? null
    });
    return null;
  }

  return { musicBrainzId: best.candidate.id!, name: best.candidate.name!, confidence: best.confidence };
}

function scoreArtistMatch(candidate: MusicBrainzArtistSearchApi, normalizedTarget: string, knownCountry: string | null): number {
  const name = normalizeText(candidate.name ?? "");
  const mbScore = typeof candidate.score === "number" ? candidate.score : Number.parseFloat(String(candidate.score ?? "0")) || 0;
  let confidence = Math.min(mbScore / 100, 1) * 0.5;

  if (name === normalizedTarget) {
    confidence += 0.4;
  } else if (name.includes(normalizedTarget) || normalizedTarget.includes(name)) {
    confidence += 0.15;
  }

  const aliasMatch = (candidate.aliases ?? []).some((alias) => normalizeText(alias.name ?? "") === normalizedTarget);
  if (aliasMatch) {
    confidence += 0.2;
  }

  if (knownCountry && sameCountry(candidate.country, knownCountry)) {
    confidence += 0.15;
  }

  return clamp01(confidence);
}

async function fetchArtistReleasesWithLabels(
  musicBrainzId: string,
  env: MusicBrainzLabelProviderEnv,
  fetchImpl: FetchLike,
  maxReleases: number
): Promise<MusicBrainzReleaseSummary[]> {
  const url = new URL("https://musicbrainz.org/ws/2/release");
  url.searchParams.set("artist", musicBrainzId);
  url.searchParams.set("inc", "labels");
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", String(Math.max(1, Math.min(maxReleases, 100))));

  const data = await fetchMusicBrainzJson<MusicBrainzReleaseBrowseResponse>(url.toString(), env, fetchImpl);
  return (data.releases ?? [])
    .filter((release): release is MusicBrainzReleaseApi & { id: string; title: string } => Boolean(release.id && release.title))
    .slice(0, maxReleases)
    .map((release) => ({
      releaseId: release.id,
      releaseTitle: release.title,
      releaseDate: release.date?.trim() || null,
      labelCredits: (release["label-info"] ?? [])
        .filter((info): info is MusicBrainzLabelInfoApi & { label: { id: string; name: string } } => Boolean(info.label?.id && info.label?.name))
        .map((info) => ({ labelId: info.label.id, labelName: info.label.name }))
    }));
}

async function fetchLabelMetadata(
  labelId: string,
  env: MusicBrainzLabelProviderEnv,
  fetchImpl: FetchLike
): Promise<MusicBrainzLabelMetadata | null> {
  const url = new URL(`https://musicbrainz.org/ws/2/label/${encodeURIComponent(labelId)}`);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("inc", "url-rels");

  const data = await fetchMusicBrainzJson<MusicBrainzLabelLookupApi>(url.toString(), env, fetchImpl);
  if (!data.id || !data.name) {
    return null;
  }

  const relations = data.relations ?? [];
  const officialUrls = relations
    .filter((relation) => relation.type === "official homepage" && relation.url?.resource)
    .map((relation) => relation.url!.resource!);
  const bandcampUrls = relations
    .map((relation) => relation.url?.resource)
    .filter((resource): resource is string => Boolean(resource) && /bandcamp\.com/i.test(resource ?? ""));

  return {
    musicBrainzId: data.id,
    name: data.name,
    country: normalizeCountry(data.country),
    city: extractAreaName(data.area),
    labelType: data.type ?? null,
    beginDate: data["life-span"]?.begin?.trim() || null,
    endDate: data["life-span"]?.end?.trim() || null,
    ended: Boolean(data["life-span"]?.ended),
    disambiguation: data.disambiguation?.trim() || null,
    officialUrls,
    bandcampUrls,
    sourceUrl: `https://musicbrainz.org/label/${encodeURIComponent(data.id)}`
  };
}

function buildCandidateFromLabel(accumulator: LabelEvidenceAccumulator, metadata: MusicBrainzLabelMetadata | null): RawLabelCandidate {
  const name = metadata?.name ?? accumulator.labelName;
  const artistNames = [...new Set(accumulator.evidence.map((entry) => entry.similarArtistName).filter((value): value is string => Boolean(value)))];
  const releaseTitles = [
    ...new Set(accumulator.evidence.map((entry) => entry.releaseTitle).filter((value): value is string => Boolean(value)))
  ];

  const textParts: string[] = [`${name} is a record label.`];
  if (metadata?.labelType) {
    textParts.push(`Label type: ${metadata.labelType}.`);
  }
  if (metadata?.city || metadata?.country) {
    textParts.push(`Based in ${[metadata.city, metadata.country].filter(Boolean).join(", ")}.`);
  }
  if (metadata?.disambiguation) {
    textParts.push(`${metadata.disambiguation}.`);
  }
  if (artistNames.length > 0) {
    textParts.push(`Released music by ${artistNames.join(", ")}.`);
  }
  if (releaseTitles.length > 0) {
    textParts.push(`Known releases on this label: ${releaseTitles.join(", ")}.`);
  }

  if (metadata?.ended || metadata?.endDate) {
    textParts.push(`This label ceased operations${metadata.endDate ? ` in ${metadata.endDate}` : ""}.`);
  } else {
    const mostRecentYear = mostRecentYearFrom(accumulator.releaseDates);
    if (mostRecentYear) {
      textParts.push(`Most recently released music in ${mostRecentYear}.`);
    }
    if (metadata?.beginDate) {
      textParts.push(`Founded in ${metadata.beginDate}.`);
    }
  }

  const officialUrls = metadata?.officialUrls ?? [];
  const bandcampUrls = metadata?.bandcampUrls ?? [];
  const fallbackUrl = metadata?.sourceUrl ?? `https://musicbrainz.org/label/${encodeURIComponent(accumulator.labelId)}`;
  const url = officialUrls[0] ?? bandcampUrls[0] ?? fallbackUrl;
  const links = [...officialUrls, ...bandcampUrls, fallbackUrl];
  const confidence = clamp01(accumulator.evidence.reduce((max, entry) => Math.max(max, entry.confidence), 0.5));

  return {
    name,
    url,
    sourceName: "musicbrainz",
    strategy: "similar_artist_release",
    text: textParts.join(" "),
    links,
    confidence,
    country: metadata?.country ?? null,
    externalIds: { musicBrainzId: accumulator.labelId },
    evidence: accumulator.evidence
  };
}

function mostRecentYearFrom(dates: string[]): number | null {
  const years = dates.map((date) => Number.parseInt(date.slice(0, 4), 10)).filter((year) => Number.isFinite(year));
  return years.length > 0 ? Math.max(...years) : null;
}

function sameCountry(candidateCountry: string | null | undefined, knownCountry: string | null): boolean {
  if (!candidateCountry || !knownCountry) {
    return false;
  }
  return normalizeText(normalizeCountry(candidateCountry) ?? "") === normalizeText(knownCountry);
}

function extractAreaName(value: { name?: string | null } | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  return value.name?.trim() || null;
}

function normalizeCountry(country: string | null | undefined): string | null {
  const trimmed = country?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toUpperCase() === "FR" ? "France" : trimmed;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(value, 1));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
