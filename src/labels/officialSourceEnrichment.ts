import type { WebExtractProvider } from "../providers/web/WebExtractProvider.js";
import { debugLog, warnLog } from "../utils/logger.js";
import { TtlCache } from "../utils/ttlCache.js";
import type { LabelEvidence, RawLabelCandidate } from "./types.js";

// Issue #195, steps 5-7: for every structured label candidate, find its most
// authoritative public URL and enrich the candidate from it (and, if a
// confidently-associated Bandcamp page exists, from that too). Reuses the
// WebExtractProvider already built for PR #181's web-search discovery —
// this module only decides *which* URLs are worth extracting and how to
// gate Bandcamp pages, it doesn't reimplement extraction.

export interface OfficialSourceEnrichmentEnv {
  ENABLE_BANDCAMP_LABEL_ENRICHMENT?: string;
}

export function isBandcampLabelEnrichmentEnabled(env: OfficialSourceEnrichmentEnv = process.env): boolean {
  return env.ENABLE_BANDCAMP_LABEL_ENRICHMENT !== "false";
}

interface ExtractedPage {
  url: string;
  text: string;
}

export interface OfficialSourceEnrichmentOptions {
  env?: OfficialSourceEnrichmentEnv;
  webExtractProvider: WebExtractProvider | null;
  maxCandidates?: number;
  maxPagesPerLabel?: number;
  pageCache?: TtlCache<string, ExtractedPage | null>;
}

export interface OfficialSourceEnrichmentResult {
  candidates: RawLabelCandidate[];
  warnings: string[];
  metadata: {
    candidatesProcessed: number;
    pagesExtracted: number;
    bandcampRejected: number;
  };
}

// Prioritized sub-paths from issue #195 step 6, tried on an official website
// homepage only (Bandcamp pages don't have this structure).
const PRIORITY_PATHS = ["/about", "/roster", "/artists", "/demo", "/demos", "/submissions", "/contact", "/releases"];

// Aggregators, search-result pages and stores that must never be treated as
// a label's "official" source (issue #195 step 5).
const AGGREGATOR_HOSTS = new Set([
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
  "x.com",
  "spotify.com",
  "open.spotify.com"
]);

const MULTI_ARTIST_HINT_PATTERN = /\b(various artists|va\b|our artists|artists:|roster)\b/i;
const LABEL_WORDING_PATTERN = /\b(record label|net ?label|label imprint|independent label|maison de disques)\b/i;
const CATALOG_STRUCTURE_PATTERN = /\b(catalog(?:ue)? ?(?:number|#)|cat(?:\.|alog)? ?no\.?)\b/i;

const defaultPageCache = new TtlCache<string, ExtractedPage | null>(6 * 60 * 60 * 1000);

export function resetOfficialSourceEnrichmentCache(): void {
  defaultPageCache.clear();
}

export async function enrichLabelCandidatesFromOfficialSources(
  candidates: RawLabelCandidate[],
  options: OfficialSourceEnrichmentOptions
): Promise<OfficialSourceEnrichmentResult> {
  const emptyMetadata = { candidatesProcessed: 0, pagesExtracted: 0, bandcampRejected: 0 };
  if (!options.webExtractProvider) {
    return { candidates, warnings: [], metadata: emptyMetadata };
  }

  const webExtractProvider = options.webExtractProvider;
  const env = options.env ?? process.env;
  const bandcampEnabled = isBandcampLabelEnrichmentEnabled(env);
  const maxCandidates = options.maxCandidates ?? 10;
  const maxPagesPerLabel = options.maxPagesPerLabel ?? 3;
  const pageCache = options.pageCache ?? defaultPageCache;

  const warnings: string[] = [];
  let candidatesProcessed = 0;
  let pagesExtracted = 0;
  let bandcampRejected = 0;

  const enrichedCandidates: RawLabelCandidate[] = [];
  for (const candidate of candidates) {
    if (candidatesProcessed >= maxCandidates) {
      enrichedCandidates.push(candidate);
      continue;
    }
    candidatesProcessed += 1;

    const officialUrl = selectOfficialUrl(candidate);
    const bandcampUrl = bandcampEnabled ? selectBandcampUrl(candidate) : null;
    const targets = [
      ...(officialUrl ? [{ url: officialUrl, isBandcamp: false }] : []),
      ...(bandcampUrl && bandcampUrl !== officialUrl ? [{ url: bandcampUrl, isBandcamp: true }] : [])
    ];

    if (targets.length === 0) {
      enrichedCandidates.push(candidate);
      continue;
    }

    let enriched = candidate;
    for (const target of targets) {
      try {
        const pages = await extractPages(target.url, target.isBandcamp, webExtractProvider, pageCache, maxPagesPerLabel);
        pagesExtracted += pages.length;
        if (pages.length === 0) {
          continue;
        }

        if (target.isBandcamp && !hasStructuredProvenance(candidate)) {
          const combinedText = pages.map((page) => page.text).join(" ");
          if (!looksLikeBandcampLabel(combinedText)) {
            bandcampRejected += 1;
            debugLog("labels", "[bandcamp] rejected single-artist page", { url: target.url, candidateName: candidate.name });
            continue;
          }
        }

        enriched = mergeExtractedPages(enriched, pages, target.isBandcamp ? "bandcamp" : "official_website");
      } catch (error) {
        const message = errorMessage(error);
        warnings.push(`Official-source enrichment failed for "${candidate.name}" (${target.url}): ${message}.`);
        warnLog("labels", "[enrichment] official page extraction failed", { url: target.url, message });
      }
    }

    enrichedCandidates.push(enriched);
  }

  debugLog("labels", "[enrichment] official-source summary", { candidatesProcessed, pagesExtracted, bandcampRejected });

  return {
    candidates: enrichedCandidates,
    warnings,
    metadata: { candidatesProcessed, pagesExtracted, bandcampRejected }
  };
}

async function extractPages(
  baseUrl: string,
  isBandcamp: boolean,
  provider: WebExtractProvider,
  cache: TtlCache<string, ExtractedPage | null>,
  maxPages: number
): Promise<ExtractedPage[]> {
  const candidateUrls = isBandcamp ? [baseUrl] : buildPriorityUrls(baseUrl, maxPages);
  const pages: ExtractedPage[] = [];

  for (const url of candidateUrls) {
    if (pages.length >= maxPages) {
      break;
    }
    const page = await cache.getOrCreate(url, async () => {
      const extracted = await provider.extract(url);
      if (!extracted) {
        return null;
      }
      const text = [extracted.title, extracted.text, extracted.markdown].filter(Boolean).join(" ").trim();
      return text ? { url, text } : null;
    });
    if (page) {
      pages.push(page);
    }
  }

  return pages;
}

function buildPriorityUrls(baseUrl: string, maxPages: number): string[] {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.pathname && parsed.pathname !== "/") {
      // Already a specific page (not a bare homepage); trying guessed
      // sub-paths on top of it isn't meaningful.
      return [baseUrl];
    }
    const origin = `${parsed.protocol}//${parsed.host}`;
    return [baseUrl, ...PRIORITY_PATHS.map((path) => `${origin}${path}`)].slice(0, Math.max(1, maxPages));
  } catch {
    return [baseUrl];
  }
}

function selectOfficialUrl(candidate: RawLabelCandidate): string | null {
  const candidates = [candidate.url, ...candidate.links];
  return candidates.find((url): url is string => Boolean(url) && isOfficialLookingUrl(url!)) ?? null;
}

function selectBandcampUrl(candidate: RawLabelCandidate): string | null {
  const candidates = [candidate.url, ...candidate.links];
  return candidates.find((url): url is string => Boolean(url) && /(^https?:\/\/)([\w-]+\.)?bandcamp\.com/i.test(url!)) ?? null;
}

function isOfficialLookingUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }
  if (/bandcamp\.com/i.test(url)) {
    return false;
  }
  try {
    const host = new URL(url).host.toLowerCase();
    return !AGGREGATOR_HOSTS.has(host);
  } catch {
    return false;
  }
}

// A candidate that already carries MusicBrainz/Discogs external IDs had its
// links populated from those providers' curated relationship data (official
// homepage / Bandcamp relations, Discogs `urls`), not scraped from free text
// — so a Bandcamp URL reached this way doesn't need the heuristic gate below
// (issue #195: "MusicBrainz or Discogs relationship evidence" is itself
// sufficient evidence).
function hasStructuredProvenance(candidate: RawLabelCandidate): boolean {
  return Boolean(candidate.externalIds?.musicBrainzId || candidate.externalIds?.discogsId);
}

/**
 * Heuristic gate so a single artist's Bandcamp page is never classified as a
 * label just because it uses the word "label" in passing (issue #195: "Do
 * not classify every Bandcamp artist page as a label"). Requires at least
 * two independent signals: evidence of multiple artists, explicit label
 * wording, or catalogue/roster structure.
 */
export function looksLikeBandcampLabel(text: string): boolean {
  const signals = [MULTI_ARTIST_HINT_PATTERN.test(text), LABEL_WORDING_PATTERN.test(text), CATALOG_STRUCTURE_PATTERN.test(text)];
  return signals.filter(Boolean).length >= 2;
}

function mergeExtractedPages(
  candidate: RawLabelCandidate,
  pages: ExtractedPage[],
  provider: "official_website" | "bandcamp"
): RawLabelCandidate {
  const combinedText = pages.map((page) => page.text).join(" ");
  const newEvidence: LabelEvidence[] = pages.map((page) => ({
    provider,
    sourceUrl: page.url,
    confidence: provider === "official_website" ? 0.85 : 0.65
  }));

  return {
    ...candidate,
    text: [candidate.text, combinedText].filter(Boolean).join(" "),
    links: [...new Set([...candidate.links, ...pages.map((page) => page.url)])],
    evidence: [...(candidate.evidence ?? []), ...newEvidence]
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
