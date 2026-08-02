import { fetchWithTimeout, parseTimeoutMs } from "../../utils/fetchWithTimeout.js";
import { debugLog, warnLog } from "../../utils/logger.js";
import { TtlCache } from "../../utils/ttlCache.js";
import { extractEventPageData, selectEventDetailLinks, type ExtractedEventPageData } from "../eventPageExtraction.js";
import { matchBookingGenres } from "../genreMatching.js";
import { normalizeBookingSource } from "../normalizeBookingTarget.js";
import type { BookingSearchInput, BookingTarget, ContactCandidate, RawBookingSource } from "../types.js";
import { attachSimilarArtistContext } from "./SceneAgendaProvider.js";
import type { BookingSourceProvider } from "./BookingSourceProvider.js";

// Concerts50 (issue #210): a genre/city listing site (e.g.
// concerts50.com/france/paris/g/punk) whose category pages must never
// become an event or a venue themselves (see eventPageExtraction.ts's
// SourcePageType doc, which names this exact site as the canonical example
// of a listing page). This provider builds the listing URL directly from
// the requested country/city/genre, fetches it once, and follows a bounded
// number of the individual event-detail links it contains — it never
// derives an opportunity from the listing page's own title/metadata.

export interface Concerts50BookingSourceProviderEnv {
  ENABLE_CONCERTS50?: string;
  CONCERTS50_REQUEST_TIMEOUT_MS?: string;
  CONCERTS50_MAX_PAGES_PER_SEARCH?: string;
  DEBUG_CONCERTS50?: string;
}

export interface Concerts50BookingSourceProviderOptions {
  env?: Concerts50BookingSourceProviderEnv;
  fetchImpl?: typeof fetch;
  /** Override for tests; defaults to the real site. */
  baseUrl?: string;
}

const PROVIDER_NAME = "concerts50";
const DEFAULT_BASE_URL = "https://concerts50.com";
const DEFAULT_MAX_PAGES_PER_SEARCH = 10;
const MIN_MAX_PAGES_PER_SEARCH = 1;
const MAX_MAX_PAGES_PER_SEARCH = 30;

// Listing pages are re-checked periodically for newly announced dates;
// individual event pages change far less often once published. Caching
// (issue #210 requirement) avoids re-fetching either within one process,
// and also avoids re-hitting a page that just failed/was blocked.
const LISTING_CACHE_TTL_MS = 30 * 60 * 1000;
const DETAIL_CACHE_TTL_MS = 60 * 60 * 1000;

const listingHtmlCache = new TtlCache<string, string | null>(LISTING_CACHE_TTL_MS);
const detailHtmlCache = new TtlCache<string, string | null>(DETAIL_CACHE_TTL_MS);

const BLOCKED_PATTERN = /\b(check_bot|captcha|robots?\.txt|cloudflare|access denied|bot protection|anti-bot|forbidden)\b/i;
const ANCHOR_HREF_PATTERN = /<a\b[^>]*\bhref=["']([^"'#]{3,300})["']/gi;
const JSON_LD_PATTERN = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const CANCELLED_TEXT_PATTERN = /\b(annul[ée]e?|cancelled|canceled)\b/i;
const POSTPONED_TEXT_PATTERN = /\b(report[ée]e?|postponed|rescheduled)\b/i;

// Concerts50 is a punk/hardcore/metal/rock-scene listing site, the same
// family of sites as the existing ConcertsPunk/ConcertsMetal sources (see
// SceneAgendaProvider.ts). The genre segment of the URL is only ever built
// from this explicit, known-compatible map — an unmapped genre is skipped
// rather than guessed, per the issue's "compatible genre" requirement and
// the project's data-quality rule to return null when uncertain.
const COMPATIBLE_GENRE_SLUGS: Record<string, string> = {
  punk: "punk",
  "punk rock": "punk",
  "pop punk": "punk",
  emo: "punk",
  "emo pop": "punk",
  easycore: "punk",
  "skate punk": "punk",
  "melodic punk": "punk",
  "post-punk": "punk",
  hardcore: "hardcore",
  "hardcore punk": "hardcore",
  "post-hardcore": "hardcore",
  metal: "metal",
  metalcore: "metal",
  "heavy metal": "metal",
  "death metal": "metal",
  "black metal": "metal",
  rock: "rock",
  "indie rock": "rock",
  "alternative rock": "rock",
  "garage rock": "rock"
};

export interface Concerts50Metadata {
  enabled: boolean;
  reason: string;
  listingUrl?: string;
  candidateLinksFound?: number;
  eventsFetched?: number;
  eventsKept?: number;
  rejectedNoDate?: number;
  rejectedNotIdentifiable?: number;
  rejectedBlocked?: number;
  [key: string]: unknown;
}

export function isConcerts50Enabled(env: Concerts50BookingSourceProviderEnv = process.env): boolean {
  return env.ENABLE_CONCERTS50 === "true";
}

export function getConcerts50ProviderStatus(env: Concerts50BookingSourceProviderEnv = process.env): { enabled: boolean; reason: string } {
  if (!isConcerts50Enabled(env)) {
    return { enabled: false, reason: "ENABLE_CONCERTS50 is not true" };
  }
  return { enabled: true, reason: "enabled by ENABLE_CONCERTS50" };
}

/** Maps a booking genre to Concerts50's own genre segment, or null when there is no known-compatible category. */
export function resolveConcerts50GenreSlug(genre: string): string | null {
  const normalized = normalizeForMatching(genre);
  if (COMPATIBLE_GENRE_SLUGS[normalized]) {
    return COMPATIBLE_GENRE_SLUGS[normalized];
  }
  for (const [key, slug] of Object.entries(COMPATIBLE_GENRE_SLUGS)) {
    if (normalized.includes(key)) {
      return slug;
    }
  }
  return null;
}

export function buildConcerts50ListingUrl(baseUrl: string, country: string, city: string, genreSlug: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  return `${trimmedBase}/${slugifySegment(country)}/${slugifySegment(city)}/g/${slugifySegment(genreSlug)}`;
}

export function buildConcerts50BookingSourceProvider(
  options: Concerts50BookingSourceProviderOptions = {}
): BookingSourceProvider {
  const env = options.env ?? (process.env as Concerts50BookingSourceProviderEnv);
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = parseTimeoutMs(env.CONCERTS50_REQUEST_TIMEOUT_MS);
  const maxDetailPages = parsePositiveInt(env.CONCERTS50_MAX_PAGES_PER_SEARCH, DEFAULT_MAX_PAGES_PER_SEARCH, MIN_MAX_PAGES_PER_SEARCH, MAX_MAX_PAGES_PER_SEARCH);

  return {
    providerName: PROVIDER_NAME,
    async search({ input }) {
      const status = getConcerts50ProviderStatus(env);
      if (!status.enabled) {
        return emptyResult([], [`Concerts50 provider is disabled: ${status.reason}.`], { enabled: false, reason: status.reason });
      }

      const country = input.artistProfile?.country?.trim() || "France";
      const city = input.city?.trim() || input.artistProfile?.city?.trim() || null;
      if (!city) {
        return emptyResult([], ["Concerts50 skipped: no city available to build the listing URL."], {
          enabled: true,
          reason: "missing_city"
        });
      }

      const genreSlug = resolveConcerts50GenreSlug(input.genre);
      if (!genreSlug) {
        return emptyResult([], [`Concerts50 skipped: genre "${input.genre}" has no compatible Concerts50 category.`], {
          enabled: true,
          reason: "incompatible_genre"
        });
      }

      const listingUrl = buildConcerts50ListingUrl(baseUrl, country, city, genreSlug);
      const searchedQueries = [listingUrl];
      const warnings: string[] = [];

      const listingHtml = await fetchHtml(listingUrl, fetchImpl, timeoutMs, listingHtmlCache, warnings);
      if (!listingHtml) {
        return emptyResult(searchedQueries, dedupeWarnings(warnings, `Concerts50 listing page could not be fetched: ${listingUrl}.`), {
          enabled: true,
          reason: "listing_fetch_failed",
          listingUrl
        });
      }
      if (isBlockedPage(listingHtml)) {
        warnings.push(`Concerts50 listing page returned a blocked/protected response: ${listingUrl}.`);
        return emptyResult(searchedQueries, warnings, { enabled: true, reason: "blocked", listingUrl });
      }

      const candidateLinks = selectEventDetailLinks(extractLinks(listingHtml), listingUrl, maxDetailPages);
      debugLog("concerts50", `${candidateLinks.length} candidate event link(s) selected from ${listingUrl}`);

      const targets: BookingTarget[] = [];
      let rejectedNoDate = 0;
      let rejectedNotIdentifiable = 0;
      let rejectedBlocked = 0;

      // Sequential, not concurrent: keeps request pacing gentle on a
      // third-party site with unknown rate limits (issue #210: "respect
      // provider rate limits and robots/terms constraints"). Every fetch
      // here is a single plain HTTP GET, never a browser session per event.
      for (const eventUrl of candidateLinks) {
        searchedQueries.push(eventUrl);
        const eventHtml = await fetchHtml(eventUrl, fetchImpl, timeoutMs, detailHtmlCache, warnings);
        if (!eventHtml) continue;
        if (isBlockedPage(eventHtml)) {
          rejectedBlocked += 1;
          continue;
        }

        const eventData = extractEventPageData(eventHtml, eventUrl);
        // Requirement: "Reject entries without a specific event date and
        // identifiable event." A date is mandatory; an identifiable event
        // additionally requires a real title or at least one named
        // performer — never derived from the listing page's own SEO title.
        if (!eventData.eventDate) {
          rejectedNoDate += 1;
          continue;
        }
        const isIdentifiable = eventData.fieldSources.title !== "generic_fallback" || eventData.headliners.length > 0 || eventData.lineup.length > 0;
        if (!isIdentifiable) {
          rejectedNotIdentifiable += 1;
          continue;
        }

        const extras = extractConcerts50Extras(eventHtml);
        const target = buildBookingTarget(input, eventUrl, listingUrl, country, city, eventData, extras);
        if (target) {
          targets.push(attachSimilarArtistContext(input, target));
        }
      }

      logConcerts50Summary({
        listingUrl,
        candidateLinksFound: candidateLinks.length,
        eventsKept: targets.length,
        rejectedNoDate,
        rejectedNotIdentifiable,
        rejectedBlocked
      });

      return {
        targets,
        sourceProvider: PROVIDER_NAME,
        searchedQueries,
        warnings: dedupeWarnings(warnings),
        metadata: {
          enabled: true,
          reason: "ok",
          listingUrl,
          candidateLinksFound: candidateLinks.length,
          eventsFetched: candidateLinks.length,
          eventsKept: targets.length,
          rejectedNoDate,
          rejectedNotIdentifiable,
          rejectedBlocked
        } satisfies Concerts50Metadata
      };
    }
  };
}

function emptyResult(searchedQueries: string[], warnings: string[], metadata: Concerts50Metadata) {
  return {
    targets: [],
    sourceProvider: PROVIDER_NAME,
    searchedQueries,
    warnings,
    metadata
  };
}

interface Concerts50Extras {
  price: string | null;
  currency: string | null;
  venueUrl: string | null;
  status: "cancelled" | "postponed" | null;
}

/** Best-effort JSON-LD Offer/location extraction plus text-based cancellation detection. Never throws. */
function extractConcerts50Extras(html: string): Concerts50Extras {
  let price: string | null = null;
  let currency: string | null = null;
  let venueUrl: string | null = null;

  for (const match of html.matchAll(JSON_LD_PATTERN)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        if (!isEventNode(candidate)) continue;
        const node = candidate as Record<string, unknown>;
        const offer = firstOf(node.offers) as Record<string, unknown> | undefined;
        if (offer) {
          if (price === null && (typeof offer.price === "string" || typeof offer.price === "number")) {
            price = String(offer.price);
          }
          if (currency === null && typeof offer.priceCurrency === "string") {
            currency = offer.priceCurrency;
          }
        }
        const location = firstOf(node.location) as Record<string, unknown> | undefined;
        if (venueUrl === null) {
          const rawUrl = location?.url ?? location?.sameAs;
          if (typeof rawUrl === "string" && rawUrl.trim()) {
            venueUrl = rawUrl.trim();
          }
        }
      }
    } catch {
      continue;
    }
  }

  const status = BLOCKED_PATTERN.test(html.slice(0, 2000))
    ? null
    : CANCELLED_TEXT_PATTERN.test(html)
      ? "cancelled"
      : POSTPONED_TEXT_PATTERN.test(html)
        ? "postponed"
        : null;

  return { price, currency, venueUrl, status };
}

function isEventNode(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const type = (node as Record<string, unknown>)["@type"];
  if (typeof type === "string") return /event/i.test(type);
  if (Array.isArray(type)) return type.some((entry) => typeof entry === "string" && /event/i.test(entry));
  return false;
}

function firstOf(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function buildBookingTarget(
  input: BookingSearchInput,
  eventUrl: string,
  listingUrl: string,
  country: string,
  city: string,
  eventData: ExtractedEventPageData,
  extras: Concerts50Extras
): BookingTarget | null {
  const headliner = eventData.headliners[0] ?? null;
  const lineup = uniqueStrings([...eventData.headliners, ...eventData.lineup]);
  const text = [eventData.title, eventData.description, ...lineup].filter(Boolean).join(" ");
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], [], text);

  const contacts: ContactCandidate[] = [];
  if (eventData.contactEmail) {
    contacts.push({ type: "email", value: eventData.contactEmail, sourceUrl: eventUrl, confidence: 0.7 });
  }
  if (eventData.contactFormUrl) {
    contacts.push({ type: "contact_form", value: eventData.contactFormUrl, sourceUrl: eventUrl, confidence: 0.6 });
  }

  const priceText = extras.price ? `${extras.price}${extras.currency ? ` ${extras.currency}` : ""}` : null;
  // A cancelled/postponed event is still preserved (never silently dropped,
  // per issue #210's field list) but is a much weaker booking signal, so
  // its confidence is reduced rather than left as if it were a normal
  // upcoming show.
  const confidence = extras.status ? eventData.confidence * 0.5 : eventData.confidence;

  const raw: RawBookingSource = {
    name: eventData.title ?? headliner ?? "Concerts50 event",
    category: "event",
    url: eventUrl,
    sourceUrl: eventUrl,
    sourceType: "specialized_scene_agenda",
    sourceProvider: PROVIDER_NAME,
    city: eventData.city ?? city,
    country,
    text,
    snippet: eventData.description,
    genres: genreMatch.matchedGenres,
    confidence,
    eventDate: eventData.eventDate,
    venueName: eventData.venueName,
    lineup,
    imageUrl: eventData.posterImageUrl,
    ticketUrl: eventData.ticketUrl,
    address: eventData.address,
    contacts: contacts.length > 0 ? contacts : undefined
  };

  const normalized = normalizeBookingSource(raw);
  if (!normalized) return null;

  const extraEvidence = [
    `Discovered via Concerts50 listing: ${listingUrl}.`,
    headliner ? `Headliner: ${headliner}.` : null,
    extras.venueUrl ? `Venue website: ${extras.venueUrl}.` : null,
    eventData.doorsTime ? `Doors/start time: ${eventData.doorsTime}.` : null,
    priceText ? `Price: ${priceText}.` : null,
    genreMatch.matchedGenres.length > 0
      ? `Genre evidence: ${genreMatch.matchedGenres.join(", ")}.`
      : "No explicit genre evidence found on the event page.",
    extras.status ? `Source marks this event as ${extras.status}.` : null
  ].filter((line): line is string => Boolean(line));

  return {
    ...normalized,
    pastProgramming: uniqueStrings([...(normalized.pastProgramming ?? []), ...lineup]),
    evidence: uniqueStrings([...normalized.evidence, ...extraEvidence])
  };
}

async function fetchHtml(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  cache: TtlCache<string, string | null>,
  warnings: string[]
): Promise<string | null> {
  return cache.getOrCreate(url, async () => {
    try {
      const response = await fetchWithTimeout(url, { headers: { "User-Agent": "ArtistRadar/1.0 (booking search)" } }, timeoutMs, fetchImpl, "concerts50");
      if (!response.ok) {
        warnings.push(`Concerts50 request to ${url} failed with HTTP ${response.status}.`);
        return null;
      }
      return await response.text();
    } catch (error) {
      warnings.push(`Concerts50 request to ${url} failed: ${error instanceof Error ? error.message : String(error)}.`);
      return null;
    }
  });
}

function isBlockedPage(html: string): boolean {
  return BLOCKED_PATTERN.test(html.slice(0, 2000));
}

function extractLinks(html: string): string[] {
  return [...html.matchAll(ANCHOR_HREF_PATTERN)].map((match) => match[1]);
}

function logConcerts50Summary(summary: {
  listingUrl: string;
  candidateLinksFound: number;
  eventsKept: number;
  rejectedNoDate: number;
  rejectedNotIdentifiable: number;
  rejectedBlocked: number;
}): void {
  warnLog("concerts50", [
    "Concerts50:",
    `- listing URL: ${summary.listingUrl}`,
    `- candidate event links found: ${summary.candidateLinksFound}`,
    `- events kept: ${summary.eventsKept}`,
    `- rejected (no date): ${summary.rejectedNoDate}`,
    `- rejected (not identifiable): ${summary.rejectedNotIdentifiable}`,
    `- rejected (blocked page): ${summary.rejectedBlocked}`
  ].join("\n"));
}

function parsePositiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

function slugifySegment(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeForMatching(value: string): string {
  return slugifySegment(value).replace(/-/g, " ");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function dedupeWarnings(values: string[], extra?: string): string[] {
  return [...new Set([...values, ...(extra ? [extra] : [])].filter(Boolean))];
}
