import { extractEventDate } from "./dateParsing.js";
import { extractHtmlTitle } from "../knowledge/htmlText.js";

// Extracts complete structured event data from a single event source page
// (issue #157). Structured metadata (JSON-LD, then Open Graph, then plain
// HTML meta tags) always wins over content pulled from semantic HTML or raw
// page text, which in turn wins over caller-supplied enrichment/AI data and
// a last-resort generic title. Nothing here ever throws: a broken or partial
// page should degrade to partial data, not fail the whole import.

export type EventExtractionSourceTier =
  | "structured_metadata"
  | "page_content"
  | "verified_enrichment"
  | "ai_extraction"
  | "generic_fallback";

export type ExtractedEventFieldName =
  | "title"
  | "description"
  | "eventDate"
  | "doorsTime"
  | "venueName"
  | "city"
  | "address"
  | "headliners"
  | "lineup"
  | "organizerName"
  | "promoterName"
  | "posterImageUrl"
  | "ticketUrl"
  | "contactEmail"
  | "contactFormUrl";

export interface EventEnrichmentData {
  title?: string | null;
  description?: string | null;
  eventDate?: string | null;
  doorsTime?: string | null;
  venueName?: string | null;
  city?: string | null;
  address?: string | null;
  headliners?: string[];
  lineup?: string[];
  organizerName?: string | null;
  promoterName?: string | null;
  posterImageUrl?: string | null;
  ticketUrl?: string | null;
  contactEmail?: string | null;
  contactFormUrl?: string | null;
}

export interface EventPageExtractionOptions {
  /** Data from a source that has already been independently verified (e.g. a prior confirmed booking). */
  enrichment?: EventEnrichmentData | null;
  /** Pre-computed AI extraction result, run by the caller before falling back to a generic title. */
  aiExtraction?: EventEnrichmentData | null;
  referenceDate?: Date;
  /** Label used when no title can be found anywhere (e.g. "Concert"). Defaults to "Event". */
  genericTitleFallbackLabel?: string;
}

export interface ExtractedEventPageData {
  title: string | null;
  /**
   * The raw title as originally reported by the page (JSON-LD/OG/meta/
   * document <title>) before any generic/SEO-listing rejection or
   * structured-title building — last-resort debug field only, never used
   * as the opportunity's display name (issue #201 follow-up: "Use the
   * source title only as a last-resort debug field").
   */
  sourceTitle: string | null;
  description: string | null;
  /** Normalized event date (YYYY-MM-DD), or null if none could be resolved. */
  eventDate: string | null;
  /** The original, unnormalized date text the eventDate was derived from. */
  eventDateDisplay: string | null;
  doorsTime: string | null;
  venueName: string | null;
  city: string | null;
  address: string | null;
  headliners: string[];
  lineup: string[];
  organizerName: string | null;
  promoterName: string | null;
  posterImageUrl: string | null;
  ticketUrl: string | null;
  contactEmail: string | null;
  contactFormUrl: string | null;
  sourceUrl: string | null;
  /** Overall 0-1 confidence, derived from which tiers the extracted fields came from. */
  confidence: number;
  fieldSources: Partial<Record<ExtractedEventFieldName, EventExtractionSourceTier>>;
  warnings: string[];
}

interface FieldCandidate<T> {
  value: T;
  tier: EventExtractionSourceTier;
}

/**
 * Extracts structured event data from a single event page's HTML, following
 * the priority order from issue #157: JSON-LD, then Open Graph, then plain
 * HTML meta tags, then semantic HTML, then raw page text as a last resort
 * before caller-supplied enrichment/AI data and a generic title.
 */
export function extractEventPageData(
  html: string,
  sourceUrl: string | null,
  options: EventPageExtractionOptions = {}
): ExtractedEventPageData {
  const warnings: string[] = [];
  const referenceDate = options.referenceDate ?? new Date();

  const jsonLd = safeExtract(() => extractFromJsonLd(html), warnings, "JSON-LD");
  const openGraph = safeExtract(() => extractFromOpenGraph(html), warnings, "Open Graph");
  const htmlMeta = safeExtract(() => extractFromHtmlMeta(html), warnings, "HTML metadata");
  const semanticHtml = safeExtract(() => extractFromSemanticHtml(html), warnings, "semantic HTML");
  const pageContent = safeExtract(
    () => extractFromPageContent(html, referenceDate),
    warnings,
    "page content fallback"
  );

  const structuredSources: Partial<EventEnrichmentData>[] = [jsonLd, openGraph, htmlMeta].filter(
    (source): source is Partial<EventEnrichmentData> => Boolean(source)
  );
  const contentSources: Partial<EventEnrichmentData>[] = [semanticHtml, pageContent].filter(
    (source): source is Partial<EventEnrichmentData> => Boolean(source)
  );

  const fieldSources: ExtractedEventPageData["fieldSources"] = {};

  type DefinedValue<K extends ExtractedEventFieldName> = Exclude<EventEnrichmentData[K], undefined>;

  function resolveField<K extends ExtractedEventFieldName>(field: K): FieldCandidate<DefinedValue<K>> | null {
    for (const source of structuredSources) {
      const value = source[field];
      if (!isEmptyValue(value)) {
        return { value: value as DefinedValue<K>, tier: "structured_metadata" };
      }
    }
    for (const source of contentSources) {
      const value = source[field];
      if (!isEmptyValue(value)) {
        return { value: value as DefinedValue<K>, tier: "page_content" };
      }
    }
    const enrichmentValue = options.enrichment?.[field];
    if (!isEmptyValue(enrichmentValue)) {
      return { value: enrichmentValue as DefinedValue<K>, tier: "verified_enrichment" };
    }
    const aiValue = options.aiExtraction?.[field];
    if (!isEmptyValue(aiValue)) {
      return { value: aiValue as DefinedValue<K>, tier: "ai_extraction" };
    }
    return null;
  }

  function pick<K extends ExtractedEventFieldName>(field: K, fallback: DefinedValue<K>): DefinedValue<K> {
    const resolved = resolveField(field);
    if (!resolved) return fallback;
    fieldSources[field] = resolved.tier;
    return resolved.value;
  }

  // Resolved before title so a structured "Artist A + Artist B at Venue"
  // title can be built from them (issue #201 follow-up: "Never use the HTML
  // <title> or SEO title directly when a structured event title can be
  // built" / "Reject or downgrade titles containing generic patterns").
  const headliners = pick("headliners", []);
  const lineup = pick("lineup", []);
  const venueName = pick("venueName", null);
  const rawPickedTitle = pick("title", null);
  // sanitizeRawTitle both rejects generic/SEO titles *and* strips a
  // trailing ticketing-brand segment from an otherwise-good title (e.g.
  // "Punk Paradise Paris | Next: Emerson Dias, 4 Jul | Mood" ->
  // "Punk Paradise Paris | Next: Emerson Dias, 4 Jul") — using the plain
  // isGenericOrSeoTitle boolean here previously discarded that cleaned
  // result and fell through to the original, unstripped rawPickedTitle.
  const cleanedRawTitle = sanitizeRawTitle(rawPickedTitle);
  let title: string;
  if (cleanedRawTitle) {
    // A real, specific title was already found (e.g. JSON-LD's own event
    // `name`) — never replace a genuinely good title with a rebuilt one.
    title = cleanedRawTitle;
  } else {
    const structuredTitle = buildStructuredEventTitle(headliners, lineup, venueName);
    if (structuredTitle) {
      title = structuredTitle;
      fieldSources.title = fieldSources.headliners ?? fieldSources.lineup ?? fieldSources.venueName ?? "structured_metadata";
    } else {
      title = buildGenericTitle(options, fieldSources);
    }
  }

  const eventDateResolution = resolveEventDate(structuredSources, contentSources, options, referenceDate);
  if (eventDateResolution.tier) {
    fieldSources.eventDate = eventDateResolution.tier;
  }

  const extracted: ExtractedEventPageData = {
    title,
    sourceTitle: rawPickedTitle,
    description: pick("description", null),
    eventDate: eventDateResolution.eventDate,
    eventDateDisplay: eventDateResolution.eventDateDisplay,
    doorsTime: pick("doorsTime", null),
    venueName,
    city: pick("city", null),
    address: pick("address", null),
    headliners,
    lineup,
    organizerName: pick("organizerName", null),
    promoterName: pick("promoterName", null),
    posterImageUrl: pick("posterImageUrl", null),
    ticketUrl: pick("ticketUrl", null),
    contactEmail: pick("contactEmail", null),
    contactFormUrl: pick("contactFormUrl", null),
    sourceUrl: sourceUrl ?? null,
    confidence: 0,
    fieldSources,
    warnings
  };

  extracted.confidence = computeOverallConfidence(fieldSources);
  return extracted;
}

function resolveEventDate(
  structuredSources: Partial<EventEnrichmentData>[],
  contentSources: Partial<EventEnrichmentData>[],
  options: EventPageExtractionOptions,
  referenceDate: Date
): { eventDate: string | null; eventDateDisplay: string | null; tier: EventExtractionSourceTier | null } {
  const orderedSources: { source: Partial<EventEnrichmentData>; tier: EventExtractionSourceTier }[] = [
    ...structuredSources.map((source) => ({ source, tier: "structured_metadata" as const })),
    ...contentSources.map((source) => ({ source, tier: "page_content" as const }))
  ];

  for (const { source, tier } of orderedSources) {
    const raw = source.eventDate;
    if (isEmptyValue(raw)) continue;
    const normalized = normalizeDateValue(raw as string, referenceDate);
    if (normalized) {
      return { eventDate: normalized, eventDateDisplay: raw as string, tier };
    }
  }

  if (!isEmptyValue(options.enrichment?.eventDate)) {
    const raw = options.enrichment!.eventDate as string;
    const normalized = normalizeDateValue(raw, referenceDate) ?? raw;
    return { eventDate: normalized, eventDateDisplay: raw, tier: "verified_enrichment" };
  }

  if (!isEmptyValue(options.aiExtraction?.eventDate)) {
    const raw = options.aiExtraction!.eventDate as string;
    const normalized = normalizeDateValue(raw, referenceDate) ?? raw;
    return { eventDate: normalized, eventDateDisplay: raw, tier: "ai_extraction" };
  }

  return { eventDate: null, eventDateDisplay: null, tier: null };
}

function normalizeDateValue(raw: string, referenceDate: Date): string | null {
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  return extractEventDate(raw, referenceDate);
}

function buildGenericTitle(
  options: EventPageExtractionOptions,
  fieldSources: ExtractedEventPageData["fieldSources"]
): string {
  fieldSources.title = "generic_fallback";
  return options.genericTitleFallbackLabel ?? "Event";
}

// Preferred title format (issue #201 follow-up): "Artist A + Artist B at
// Venue Name", or "Artist A + Artist B" / "Artist A at Venue Name" when only
// one side is available. Returns null (never a partial/empty string) when
// there isn't at least one performer to build from — callers fall back to
// the raw page title (if not generic/SEO-looking) or a generic label.
function buildStructuredEventTitle(headliners: string[], lineup: string[], venueName: string | null): string | null {
  const artists = headliners.length > 0 ? headliners : lineup;
  if (artists.length === 0) {
    return null;
  }
  const artistsText = artists.join(" + ");
  return venueName ? `${artistsText} at ${venueName}` : artistsText;
}

function computeOverallConfidence(fieldSources: ExtractedEventPageData["fieldSources"]): number {
  const weights: Record<EventExtractionSourceTier, number> = {
    structured_metadata: 1,
    page_content: 0.7,
    verified_enrichment: 0.6,
    ai_extraction: 0.5,
    generic_fallback: 0.15
  };
  const coreFields: ExtractedEventFieldName[] = ["title", "eventDate", "venueName", "city"];
  const scores = coreFields.map((field) => {
    const tier = fieldSources[field];
    return tier ? weights[tier] : 0;
  });
  const sum = scores.reduce((total, score) => total + score, 0);
  return Math.round((sum / coreFields.length) * 100) / 100;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function safeExtract<T>(fn: () => T, warnings: string[], label: string): T | null {
  try {
    return fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`${label} extraction failed: ${message}.`);
    return null;
  }
}

// --- JSON-LD -----------------------------------------------------------

const JSON_LD_PATTERN = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const EVENT_TYPE_PATTERN = /event/i;

function parseJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  let match: RegExpExecArray | null;
  JSON_LD_PATTERN.lastIndex = 0;
  while ((match = JSON_LD_PATTERN.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      blocks.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      // Ignore malformed JSON-LD blocks; other tiers can still supply data.
    }
  }
  return blocks;
}

function extractFromJsonLd(html: string): Partial<EventEnrichmentData> | null {
  const candidates = parseJsonLdBlocks(html).flatMap((block) => flattenJsonLdGraph(block));
  const eventNode = candidates.find((node) => isEventLikeNode(node));
  if (!eventNode) return null;

  const node = eventNode as Record<string, unknown>;
  const location = firstOf(node.location);
  const address = extractJsonLdAddress(location);
  const performers = extractJsonLdPerformers(node.performer);
  const organizer = firstOf(node.organizer) as Record<string, unknown> | undefined;
  const offer = firstOf(node.offers) as Record<string, unknown> | undefined;

  return {
    title: asString(node.name),
    description: asString(node.description),
    eventDate: asString(node.startDate),
    doorsTime: asString(node.doorTime),
    venueName: asString((location as Record<string, unknown> | undefined)?.name),
    city: address.city,
    address: address.line,
    headliners: performers.length > 0 ? [performers[0]] : [],
    lineup: performers,
    organizerName: asString(organizer?.name),
    posterImageUrl: extractJsonLdImage(node.image),
    ticketUrl: asString(offer?.url),
    contactEmail: asString(organizer?.email) ?? asString(node.email)
  };
}

function flattenJsonLdGraph(node: unknown): unknown[] {
  if (!node || typeof node !== "object") return [];
  const record = node as Record<string, unknown>;
  if (Array.isArray(record["@graph"])) {
    return record["@graph"].flatMap((item) => flattenJsonLdGraph(item));
  }
  return [record];
}

function isEventLikeNode(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const type = (node as Record<string, unknown>)["@type"];
  if (typeof type === "string") return EVENT_TYPE_PATTERN.test(type);
  if (Array.isArray(type)) return type.some((t) => typeof t === "string" && EVENT_TYPE_PATTERN.test(t));
  return false;
}

interface JsonLdAddress {
  city: string | null;
  postalCode: string | null;
  country: string | null;
  line: string | null;
}

function extractJsonLdAddress(location: unknown): JsonLdAddress {
  if (!location || typeof location !== "object") return { city: null, postalCode: null, country: null, line: null };
  const address = (location as Record<string, unknown>).address;
  if (typeof address === "string") return { city: null, postalCode: null, country: null, line: address };
  if (address && typeof address === "object") {
    const addressRecord = address as Record<string, unknown>;
    const city = asString(addressRecord.addressLocality);
    const postalCode = asString(addressRecord.postalCode);
    const country = asString(addressRecord.addressCountry);
    const parts = [addressRecord.streetAddress, addressRecord.postalCode, addressRecord.addressLocality]
      .map((part) => asString(part))
      .filter((part): part is string => Boolean(part));
    return { city, postalCode, country, line: parts.length > 0 ? parts.join(", ") : null };
  }
  return { city: null, postalCode: null, country: null, line: null };
}

function extractJsonLdPerformers(performer: unknown): string[] {
  const list = Array.isArray(performer) ? performer : performer ? [performer] : [];
  return list
    .map((entry) => (typeof entry === "string" ? entry : asString((entry as Record<string, unknown>)?.name)))
    .filter((name): name is string => Boolean(name));
}

function extractJsonLdImage(image: unknown): string | null {
  const first = firstOf(image);
  if (typeof first === "string") return first;
  if (first && typeof first === "object") return asString((first as Record<string, unknown>).url);
  return null;
}

function firstOf(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// --- Open Graph ----------------------------------------------------------

function extractFromOpenGraph(html: string): Partial<EventEnrichmentData> | null {
  const title = matchMetaProperty(html, "og:title");
  const description = matchMetaProperty(html, "og:description");
  const image = matchMetaProperty(html, "og:image");
  const eventDate = matchMetaProperty(html, "event:start_time") ?? matchMetaProperty(html, "og:start_time");
  if (!title && !description && !image && !eventDate) return null;
  return { title, description, posterImageUrl: image, eventDate };
}

function matchMetaProperty(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
    "i"
  );
  const match = html.match(pattern);
  return asString(match?.[1] ?? match?.[2] ?? null);
}

// --- HTML metadata ---------------------------------------------------------

function extractFromHtmlMeta(html: string): Partial<EventEnrichmentData> | null {
  const description = matchMetaProperty(html, "description");
  const title = extractHtmlTitle(html);
  if (!description && !title) return null;
  return { title, description };
}

// --- Semantic HTML ---------------------------------------------------------

const TIME_TAG_PATTERN = /<time[^>]+datetime=["']([^"']+)["'][^>]*>/i;
const ADDRESS_TAG_PATTERN = /<address[^>]*>([\s\S]*?)<\/address>/i;
const MAILTO_PATTERN = /href=["']mailto:([^"'?]+)["']/i;
const TICKET_LINK_PATTERN = /<a[^>]+href=["']([^"']+)["'][^>]*>(?:(?!<\/a>)[\s\S]){0,80}?(billet|ticket|reserv|book now)/i;
const CONTACT_LINK_PATTERN = /<a[^>]+href=["']([^"']+)["'][^>]*>(?:(?!<\/a>)[\s\S]){0,80}?(contact|booking|programmation)/i;
const POSTER_IMG_PATTERN = /<img[^>]+(?:class|id)=["'][^"']*(?:poster|flyer|affiche)[^"']*["'][^>]+src=["']([^"']+)["']|<img[^>]+src=["']([^"']+)["'][^>]+(?:class|id)=["'][^"']*(?:poster|flyer|affiche)[^"']*["']/i;

// Many small/DIY venue pages have no JSON-LD at all, but still lay out their
// <address> block as "Venue Name, street address, postal code city" (e.g.
// "GRRRND ZERO, 60 Avenue de Bohlen, Vaulx en Velin 69120") — the venue name
// was already being read as part of `address` and silently discarded rather
// than surfaced as its own field. Only fires when the segment before the
// first comma does NOT itself look like the start of a street address (a
// French street address conventionally opens with a house number), so a
// plain "12 rue des Lilas, 75001 Paris" address with no venue name prefix at
// all is left alone rather than misreading its street number as a name.
const VENUE_NAME_FROM_ADDRESS_PATTERN = /^([^\d,][^,]{1,60}),\s*\d/;

function extractVenueNameFromAddressText(addressText: string): string | null {
  const match = addressText.match(VENUE_NAME_FROM_ADDRESS_PATTERN);
  if (!match) return null;
  const candidate = match[1].trim();
  return candidate.length > 0 ? candidate : null;
}

function extractFromSemanticHtml(html: string): Partial<EventEnrichmentData> | null {
  const eventDate = html.match(TIME_TAG_PATTERN)?.[1] ?? null;
  const addressMatch = html.match(ADDRESS_TAG_PATTERN)?.[1];
  const address = addressMatch ? stripTags(addressMatch) : null;
  const venueName = address ? extractVenueNameFromAddressText(address) : null;
  const contactEmail = html.match(MAILTO_PATTERN)?.[1]?.trim() ?? null;
  const ticketUrl = html.match(TICKET_LINK_PATTERN)?.[1] ?? null;
  const contactFormUrl = html.match(CONTACT_LINK_PATTERN)?.[1] ?? null;
  const posterMatch = html.match(POSTER_IMG_PATTERN);
  const posterImageUrl = posterMatch ? posterMatch[1] ?? posterMatch[2] ?? null : null;

  if (!eventDate && !address && !venueName && !contactEmail && !ticketUrl && !contactFormUrl && !posterImageUrl) {
    return null;
  }

  return {
    eventDate,
    address,
    venueName,
    contactEmail,
    ticketUrl,
    contactFormUrl,
    posterImageUrl
  };
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

// --- Raw page content fallback ---------------------------------------------

// Matches a date-shaped substring in visible text so the last-resort tier can
// still preserve the original display value; the actual normalization always
// goes through extractEventDate (via normalizeDateValue), so a slightly loose
// match here only affects what gets shown, not what gets parsed.
const DATE_SNIPPET_PATTERN =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?|(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\.?\s+)?\d{1,2}(?:er)?\s+[a-zà-ÿ]+\.?(?:\s+\d{4})?)\b/i;

function extractFromPageContent(html: string, referenceDate: Date): Partial<EventEnrichmentData> | null {
  const text = stripTags(html);
  if (!text) return null;
  const normalized = extractEventDate(text, referenceDate);
  if (!normalized) return null;
  const snippet = text.match(DATE_SNIPPET_PATTERN)?.[0] ?? normalized;
  return { eventDate: snippet };
}

// =============================================================================
// Venue/organization identity extraction for generic agenda/listing pages.
//
// A page like quai-m.fr/agenda has an H1/<title> of "Agenda" — a page-section
// label, not the venue's name. This section resolves the *venue's own*
// identity (never a generic page label) and detects when a page is a
// multi-event listing rather than one event, so a date is never leaked from
// an unrelated event card onto the venue itself.
// =============================================================================

export const GENERIC_PAGE_TITLES = [
  "agenda",
  "events",
  "event",
  "événements",
  "evenements",
  "programme",
  "programmation",
  "calendar",
  "concerts",
  "accueil",
  "home",
  "actualités",
  "actualites"
];

function normalizeForComparison(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

const GENERIC_PAGE_TITLE_SET = new Set(GENERIC_PAGE_TITLES.map(normalizeForComparison));

export function isGenericPageTitle(value: string): boolean {
  return GENERIC_PAGE_TITLE_SET.has(normalizeForComparison(value));
}

// Broader, pattern-based SEO/listing-title detection (issue #201 follow-up
// regression: "Emo / Hardcore / Punk Concerts in Paris 2026-2027 | Music
// Events, Gigs & Tickets" was accepted outright as a venue/event name/title
// because it never exact-matches the short GENERIC_PAGE_TITLES set above).
// Applied to the *whole* raw title, before any segment-splitting, so a
// SEO-style aggregator title is rejected even when cleanGenericTitleSegments
// would otherwise keep a trailing segment of it.
const SEO_LISTING_TITLE_PATTERNS: RegExp[] = [
  /\bconcerts?\s+in\s+[a-z][a-z\s'-]*\b/i, // "Concerts in Paris"
  /\bmusic\s+events?\b.*\b(gigs?|tickets?)\b/i, // "Music Events, Gigs & Tickets"
  /\bgigs?\s*(&|and|,)\s*tickets?\b/i,
  /\b(19|20)\d{2}\s*[-–—]\s*(19|20)\d{2}\b/, // year range, e.g. "2026-2027"
  /\bupcoming\s+events?\b/i,
  /\bbest\s+concerts?\b/i,
  /\bwhat'?s\s+on\b/i,
  /\ball\s+concerts?\b/i,
  /\bevents?\s+calendar\b/i,
  /\bgigs?\s+in\s+[a-z]/i, // "Gigs in Paris", "Poppunk Gigs in Paris"
  /\blineups?\s*(&|and)\s*tickets?\b/i, // "Lineups & Tickets"
  /\bclubbing\b.*\bdj\s+sets?\b/i, // "clubbing & DJ sets" nightlife-guide wording
  /\bsubculture\b/i, // encyclopedia/blog-style topic pages ("Punk subculture")
  /\bthe\s+art\s+of\s+\w+/i, // "The Art of Punk" article-style titles
  /[a-z][a-z0-9-]*\.(paris|fr|com|net|live|io)\s*$/i, // trailing bare domain, e.g. "— concerts.paris"
  /\btop\s+\d+\b/i, // "Top 5 Places to Listen to Live Music in Paris"
  /\breview\s+of\b/i, // "... - Review of Le Volume, Nice, France - Tripadvisor"
  /\bthe\s+evolution\s+of\b/i, // "The Evolution of Emo and Pop Punk Concert Culture"
  /\bmeet\s+the\s+(new\s+)?wave\b/i, // "meet the new wave of French punks making noise"
  /\bce\s+qu['’]?il\s+faut\s+retenir\b/i, // French article-summary phrasing
  /\bdefinitive\s+guide\b/i // "The Definitive Guide [2019]"
];

// Real listing/ticketing sites often append their own brand as the final
// "| Brand" / "· Brand" title segment (e.g. "Poppunk Gigs in Paris | DICE",
// "Emo Night: Brokencyde + Dot Dot Curve, Paris · Shotgun Tickets"). Strip
// only that trailing brand segment before pattern-checking, so a genuinely
// good title isn't rejected outright just because a ticketing platform's
// name happens to be appended to it.
const TICKETING_PLATFORM_BRAND_SET = new Set(
  ["dice", "shotgun", "shotgun tickets", "mood", "songkick", "bandsintown", "eventbrite", "festicket", "resident advisor", "ra.co", "ra"].map(
    normalizeForComparison
  )
);

function stripTrailingTicketingBrand(title: string): string {
  const segments = title.split(/\s*[|·]\s*/).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length <= 1) {
    return title;
  }
  const last = segments[segments.length - 1]!;
  if (TICKETING_PLATFORM_BRAND_SET.has(normalizeForComparison(last))) {
    return segments.slice(0, -1).join(" | ");
  }
  return title;
}

export function isSeoListingTitle(value: string): boolean {
  const trimmed = stripTrailingTicketingBrand(value.trim());
  if (!trimmed) return false;
  return SEO_LISTING_TITLE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

// Strips a trailing ticketing-platform brand segment and rejects the result
// outright if it still looks like an SEO/listing title — the single entry
// point a caller with only a raw search-result title (no page HTML to run
// the full structured extraction on) should use before accepting that title
// as a venue/event name (issue #201 follow-up).
export function sanitizeRawTitle(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const cleaned = stripTrailingTicketingBrand(trimmed);
  if (isGenericOrSeoTitle(cleaned)) {
    return null;
  }
  return cleaned;
}

// Combines the short exact-match generic-label check with the broader
// pattern-based SEO/listing-title check — the single entry point callers
// should use to decide "is this string usable as a real venue/event name?".
export function isGenericOrSeoTitle(value: string): boolean {
  return isGenericPageTitle(value) || isSeoListingTitle(value);
}

export type VenueNameSource = "structured_data" | "og_site_name" | "header_logo" | "footer" | "document_title" | "domain_inference";
export type VenueImageSource = "structured_data" | "og_image" | "header_logo" | "favicon" | "hero_image";

export interface RejectedVenueName {
  value: string;
  reason: "generic_page_title";
}

// Issue #201 follow-up: distinguishes a specific venue's own page (which may
// legitimately also list many dates, e.g. quai-m.fr/agenda) from a
// third-party listing/directory/aggregator page that covers many different
// venues across a whole city or genre (e.g. concerts50.com/france/paris/g/punk)
// and represents no single venue at all. Only the former may ever become a
// "venue" opportunity; the latter must never become a venue, a single event,
// or a support-slot opportunity — it is kept only as source evidence unless a
// dedicated provider extracts its individual event entries (see Output B in
// WebSearchBookingSourceProvider.ts, which is unaffected by this distinction).
export type SourcePageType =
  | "single_event"
  | "venue"
  | "festival"
  | "event_listing"
  | "search_results"
  | "article"
  | "unknown";

export interface ExtractedVenuePageData {
  venueName: string | null;
  nameSource: VenueNameSource | null;
  rejectedNames: RejectedVenueName[];
  isCollectionPage: boolean;
  collectionPageReason: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  address: string | null;
  locationSource: "structured_data" | "footer" | null;
  imageUrl: string | null;
  imageSource: VenueImageSource | null;
  eventDate: string | null;
  eventDateDisplay: string | null;
  confidence: number;
  warnings: string[];
  pageType: SourcePageType;
  isSingleEvent: boolean;
  isVenue: boolean;
  pageTypeReason: string;
}

// --- JSON-LD organization/venue -------------------------------------------

const ORGANIZATION_TYPE_PATTERN = /musicvenue|organization|performingartstheater|localbusiness|place/i;

function isOrganizationLikeNode(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const type = (node as Record<string, unknown>)["@type"];
  if (typeof type === "string") return ORGANIZATION_TYPE_PATTERN.test(type);
  if (Array.isArray(type)) return type.some((t) => typeof t === "string" && ORGANIZATION_TYPE_PATTERN.test(t));
  return false;
}

interface VenueIdentityCandidate {
  name: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  address: string | null;
  imageUrl: string | null;
}

// Highest-priority venue-identity signal: an Event node's own `location`
// when this page describes one event, else a standalone
// Organization/MusicVenue/PerformingArtsTheater/LocalBusiness/Place node.
function extractOrganizationFromJsonLd(html: string): VenueIdentityCandidate | null {
  const candidates = parseJsonLdBlocks(html).flatMap((block) => flattenJsonLdGraph(block));

  const eventNode = candidates.find((node) => isEventLikeNode(node));
  if (eventNode) {
    const node = eventNode as Record<string, unknown>;
    const location = firstOf(node.location) as Record<string, unknown> | undefined;
    const name = asString(location?.name);
    if (location && name) {
      const address = extractJsonLdAddress(location);
      return {
        name,
        city: address.city,
        postalCode: address.postalCode,
        country: address.country,
        address: address.line,
        imageUrl: extractJsonLdImage(location.image) ?? extractJsonLdImage(node.image)
      };
    }
  }

  const orgNode = candidates.find((node) => isOrganizationLikeNode(node));
  if (orgNode) {
    const node = orgNode as Record<string, unknown>;
    const address = extractJsonLdAddress(node);
    return {
      name: asString(node.name),
      city: address.city,
      postalCode: address.postalCode,
      country: address.country,
      address: address.line,
      imageUrl: extractJsonLdImage(node.logo) ?? extractJsonLdImage(node.image)
    };
  }

  return null;
}

// --- Open Graph site name ---------------------------------------------------

function extractOgSiteName(html: string): string | null {
  return matchMetaProperty(html, "og:site_name");
}

// --- Header branding / footer organization block ---------------------------

const HEADER_BLOCK_PATTERN = /<header[^>]*>([\s\S]*?)<\/header>/i;
const LOGO_ALT_PATTERN =
  /<img[^>]+(?:class|id)=["'][^"']*logo[^"']*["'][^>]+alt=["']([^"']+)["']|<img[^>]+alt=["']([^"']+)["'][^>]+(?:class|id)=["'][^"']*logo[^"']*["']/i;
const LOGO_ARIA_LABEL_PATTERN =
  /(?:class|id)=["'][^"']*logo[^"']*["'][^>]*aria-label=["']([^"']+)["']|aria-label=["']([^"']+)["'][^>]*(?:class|id)=["'][^"']*logo[^"']*["']/i;
const LOGO_SRC_PATTERN =
  /<img[^>]+(?:class|id)=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']|<img[^>]+src=["']([^"']+)["'][^>]+(?:class|id)=["'][^"']*logo[^"']*["']/i;

function extractHeaderBranding(html: string): { name: string | null; imageUrl: string | null } {
  const header = html.match(HEADER_BLOCK_PATTERN)?.[1] ?? html.slice(0, 4000);
  const altMatch = header.match(LOGO_ALT_PATTERN);
  const ariaMatch = header.match(LOGO_ARIA_LABEL_PATTERN);
  const name = asString(altMatch?.[1] ?? altMatch?.[2]) ?? asString(ariaMatch?.[1] ?? ariaMatch?.[2]);
  const srcMatch = header.match(LOGO_SRC_PATTERN);
  const imageUrl = srcMatch?.[1] ?? srcMatch?.[2] ?? null;
  return { name, imageUrl };
}

const FOOTER_BLOCK_PATTERN = /<footer[^>]*>([\s\S]*?)<\/footer>/i;
const FOOTER_BRAND_PATTERN = /<(?:h\d|strong|b)[^>]*>([^<]{2,60})<\/(?:h\d|strong|b)>/i;
const FRENCH_ADDRESS_PATTERN = /\b\d{1,4}[^\n,]{0,60},?\s*\d{5}\s+[A-ZÀ-Ö][\wÀ-Öø-ÿ' -]+/;

function extractFooterOrganizationBlock(html: string): { name: string | null; address: string | null } {
  const footer = html.match(FOOTER_BLOCK_PATTERN)?.[1];
  if (!footer) return { name: null, address: null };

  const addressTagMatch = footer.match(ADDRESS_TAG_PATTERN)?.[1];
  const footerText = stripTags(footer);
  const address = addressTagMatch ? stripTags(addressTagMatch) : (footerText.match(FRENCH_ADDRESS_PATTERN)?.[0]?.trim() ?? null);
  const name = asString(footer.match(FOOTER_BRAND_PATTERN)?.[1]);
  return { name, address };
}

// --- Document title cleanup -------------------------------------------------

// Handles "Agenda | Quai M" -> "Quai M" and "Programmation - Le Krakatoa" ->
// "Le Krakatoa": splits on common separators, drops any segment matching
// GENERIC_PAGE_TITLES, and keeps the last remaining segment (brand names
// conventionally trail the page-specific label). Returns null when every
// segment is generic (a bare "Agenda" title with no brand at all).
function cleanGenericTitleSegments(title: string): string | null {
  const segments = title
    .split(/\s*[|\-–:]\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;
  const nonGeneric = segments.filter((segment) => !isGenericOrSeoTitle(segment));
  if (nonGeneric.length === 0) return null;
  return nonGeneric[nonGeneric.length - 1];
}

// --- Domain-based fallback ---------------------------------------------------

// Lowest-confidence tier: quai-m.fr -> "Quai M". Only used when every other
// signal is unavailable or rejected as generic.
function inferVenueNameFromDomain(hostname: string): string | null {
  const withoutWww = hostname.replace(/^www\./i, "");
  const withoutTld = withoutWww.replace(/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i, "");
  if (!withoutTld) return null;
  const words = withoutTld.split(/[-.]/).filter(Boolean);
  if (words.length === 0) return null;
  return words.map((word) => (word.length <= 2 ? word.toUpperCase() : capitalizeWord(word))).join(" ");
}

function capitalizeWord(value: string): string {
  return value.length > 0 ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

// --- Collection (listing) page detection ------------------------------------

// The keyword must be the *last* path segment (optionally with a trailing
// slash) — a listing page's URL typically ends right there ("/agenda",
// "/events"), while an individual event permalink has a further slug/id
// after it ("/event/band-a"), which must not be misdetected as a listing
// page. `URL.pathname` never includes the query string, so no `?` handling
// is needed here.
const COLLECTION_PATH_PATTERN = /\/(agenda|events?|programme|programmation|calendar|concerts)\/?$/i;
const MIN_DATE_MATCHES_FOR_COLLECTION = 3;

// A page whose URL path looks like a listing (/agenda, /events, ...) or that
// contains several distinct date-shaped snippets is treated as a collection
// of events, not one event — so a date is never resolved/leaked for it at
// the page level (ticket: "never invent or leak a date onto a venue").
function detectCollectionPage(html: string, sourceUrl: string | null): { isCollectionPage: boolean; reason: string | null } {
  const pathLooksLikeListing = sourceUrl ? COLLECTION_PATH_PATTERN.test(safePathname(sourceUrl)) : false;
  const text = stripTags(html);
  const dateMatches = text.match(new RegExp(DATE_SNIPPET_PATTERN.source, "gi")) ?? [];
  const hasManyDates = dateMatches.length >= MIN_DATE_MATCHES_FOR_COLLECTION;

  if (pathLooksLikeListing && hasManyDates) {
    return {
      isCollectionPage: true,
      reason: `URL path matches a listing pattern and ${dateMatches.length} distinct dates were found on the page`
    };
  }
  if (pathLooksLikeListing) {
    return { isCollectionPage: true, reason: "URL path matches a listing pattern (/agenda, /events, /programme, ...)" };
  }
  if (hasManyDates) {
    return { isCollectionPage: true, reason: `${dateMatches.length} distinct dates were found on the page` };
  }
  return { isCollectionPage: false, reason: null };
}

// --- Venue identity resolution (priority chain) -----------------------------

interface VenueIdentityResolution {
  venueName: string | null;
  nameSource: VenueNameSource | null;
  rejectedNames: RejectedVenueName[];
  city: string | null;
  postalCode: string | null;
  country: string | null;
  address: string | null;
  locationSource: "structured_data" | "footer" | null;
}

// Priority order (ticket §2): structured data -> og:site_name -> header
// branding -> footer block -> cleaned document title -> domain inference.
// Any candidate matching GENERIC_PAGE_TITLES is rejected and recorded rather
// than used, so a page never ends up named "Agenda"/"Programme"/etc.
function resolveVenueIdentity(html: string, sourceUrl: string | null): VenueIdentityResolution {
  const rejectedNames: RejectedVenueName[] = [];
  const reject = (value: string | null | undefined) => {
    if (value && value.trim()) rejectedNames.push({ value: value.trim(), reason: "generic_page_title" });
  };

  const structured = extractOrganizationFromJsonLd(html);
  const footer = extractFooterOrganizationBlock(html);
  const locationFromStructured = structured?.address || structured?.city ? "structured_data" as const : null;
  const locationSource: "structured_data" | "footer" | null = locationFromStructured ?? (footer.address ? "footer" : null);
  const baseLocation = {
    city: structured?.city ?? null,
    postalCode: structured?.postalCode ?? null,
    country: structured?.country ?? null,
    address: structured?.address ?? footer.address ?? null,
    locationSource
  };

  if (structured?.name) {
    if (!isGenericOrSeoTitle(structured.name)) {
      return { venueName: structured.name, nameSource: "structured_data", rejectedNames, ...baseLocation };
    }
    reject(structured.name);
  }

  const siteName = extractOgSiteName(html);
  if (siteName) {
    if (!isGenericOrSeoTitle(siteName)) {
      return { venueName: siteName, nameSource: "og_site_name", rejectedNames, ...baseLocation };
    }
    reject(siteName);
  }

  const branding = extractHeaderBranding(html);
  if (branding.name) {
    if (!isGenericOrSeoTitle(branding.name)) {
      return { venueName: branding.name, nameSource: "header_logo", rejectedNames, ...baseLocation };
    }
    reject(branding.name);
  }

  if (footer.name) {
    if (!isGenericOrSeoTitle(footer.name)) {
      return { venueName: footer.name, nameSource: "footer", rejectedNames, ...baseLocation };
    }
    reject(footer.name);
  }

  const documentTitle = extractHtmlTitle(html);
  if (documentTitle) {
    if (isGenericOrSeoTitle(documentTitle)) {
      reject(documentTitle);
    } else {
      const cleaned = cleanGenericTitleSegments(documentTitle);
      if (cleaned) {
        return { venueName: cleaned, nameSource: "document_title", rejectedNames, ...baseLocation };
      }
      reject(documentTitle);
    }
  }

  const hostname = sourceUrl ? safeHostname(sourceUrl) : null;
  const domainInferred = hostname ? inferVenueNameFromDomain(hostname) : null;
  return {
    venueName: domainInferred,
    nameSource: domainInferred ? "domain_inference" : null,
    rejectedNames,
    ...baseLocation
  };
}

// --- Venue image/logo resolution --------------------------------------------

function resolveVenueImage(html: string): { imageUrl: string | null; imageSource: VenueImageSource | null } {
  const structured = extractOrganizationFromJsonLd(html);
  if (structured?.imageUrl) {
    return { imageUrl: structured.imageUrl, imageSource: "structured_data" };
  }

  const ogImage = matchMetaProperty(html, "og:image");
  if (ogImage) {
    return { imageUrl: ogImage, imageSource: "og_image" };
  }

  const branding = extractHeaderBranding(html);
  if (branding.imageUrl) {
    return { imageUrl: branding.imageUrl, imageSource: "header_logo" };
  }

  const faviconMatch =
    html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i);
  if (faviconMatch?.[1]) {
    return { imageUrl: faviconMatch[1], imageSource: "favicon" };
  }

  const heroMatch = html.match(POSTER_IMG_PATTERN);
  const heroImage = heroMatch ? heroMatch[1] ?? heroMatch[2] ?? null : null;
  if (heroImage) {
    return { imageUrl: heroImage, imageSource: "hero_image" };
  }

  return { imageUrl: null, imageSource: null };
}

// --- Top-level venue page extraction -----------------------------------------

function computeVenueConfidence(identity: VenueIdentityResolution): number {
  if (!identity.venueName || !identity.nameSource) return 0.1;
  const sourceWeights: Record<VenueNameSource, number> = {
    structured_data: 1,
    og_site_name: 0.8,
    header_logo: 0.6,
    footer: 0.55,
    document_title: 0.45,
    domain_inference: 0.25
  };
  const nameScore = sourceWeights[identity.nameSource];
  const locationBonus = identity.city || identity.address ? 0.1 : 0;
  return Math.max(0, Math.min(1, Math.round((nameScore + locationBonus) * 100) / 100));
}

const LISTING_STRUCTURED_TYPE_PATTERN = /itemlist|collectionpage|searchresultspage/i;

function hasListingStructuredData(html: string): boolean {
  const nodes = parseJsonLdBlocks(html).flatMap((block) => flattenJsonLdGraph(block));
  return nodes.some((node) => {
    if (!node || typeof node !== "object") return false;
    const type = (node as Record<string, unknown>)["@type"];
    const types = Array.isArray(type) ? type : [type];
    return types.some((t) => typeof t === "string" && LISTING_STRUCTURED_TYPE_PATTERN.test(t));
  });
}

function countEventLikeJsonLdNodes(html: string): number {
  const nodes = parseJsonLdBlocks(html).flatMap((block) => flattenJsonLdGraph(block));
  return nodes.filter((node) => isEventLikeNode(node)).length;
}

interface SourcePageClassification {
  pageType: SourcePageType;
  isSingleEvent: boolean;
  isVenue: boolean;
  reason: string;
}

// Classifies what kind of page this source actually is, distinguishing a
// single event/venue/festival page from a listing/directory/aggregator page
// that must never become an opportunity itself (issue #201 follow-up).
function classifySourcePageType(html: string, identity: VenueIdentityResolution): SourcePageClassification {
  const documentTitle = extractHtmlTitle(html);
  const titleLooksLikeListing = documentTitle ? isSeoListingTitle(documentTitle) : false;
  const listingStructuredData = hasListingStructuredData(html);
  const eventNodeCount = countEventLikeJsonLdNodes(html);

  // Strongest, most unambiguous signal: a whole-title SEO/listing phrase
  // (e.g. "Emo / Hardcore / Punk Concerts in Paris 2026-2027 | Music Events,
  // Gigs & Tickets"), schema.org's own ItemList/CollectionPage/
  // SearchResultsPage typing, or multiple distinct Event nodes on one page —
  // none of these describe a single event or one specific venue, regardless
  // of anything else found. Deliberately does *not* key off nameSource/
  // isCollectionPage alone: many genuine small-venue sites (quai-m.fr/agenda)
  // list several dates and only resolve a name via header branding rather
  // than full Organization JSON-LD, and must still classify as "venue".
  if (titleLooksLikeListing || listingStructuredData || eventNodeCount > 1) {
    return {
      pageType: "event_listing",
      isSingleEvent: false,
      isVenue: false,
      reason: titleLooksLikeListing
        ? "Page title matches an SEO/listing pattern (e.g. \"Concerts in [city]\", \"Music Events, Gigs & Tickets\")."
        : listingStructuredData
          ? "Structured data declares an ItemList/CollectionPage/SearchResultsPage type."
          : `${eventNodeCount} distinct Event/MusicEvent nodes found on one page.`
    };
  }

  if (eventNodeCount === 1) {
    return { pageType: "single_event", isSingleEvent: true, isVenue: false, reason: "Exactly one Event/MusicEvent JSON-LD node found." };
  }

  if (identity.venueName) {
    return {
      pageType: "venue",
      isSingleEvent: false,
      isVenue: true,
      reason: identity.nameSource === "structured_data"
        ? "Structured Organization/MusicVenue/Place data identifies a specific venue."
        : "Resolved a specific venue/organization identity with no listing/aggregator signal found."
    };
  }

  return { pageType: "unknown", isSingleEvent: false, isVenue: false, reason: "No structured event, venue, or listing signal was found." };
}

/**
 * Resolves a venue/organization's real identity from a scraped page,
 * rejecting generic page-section labels ("Agenda", "Programme", ...), and
 * detects whether the page is a multi-event listing so a date is never
 * resolved/leaked for it (issue: quai-m.fr/agenda extracted as name="Agenda",
 * date="Jun 26, 2027" — an unrelated event's date).
 */
export function extractVenuePageData(html: string, sourceUrl: string | null, referenceDate: Date = new Date()): ExtractedVenuePageData {
  const warnings: string[] = [];
  const identity = resolveVenueIdentity(html, sourceUrl);
  const collection = detectCollectionPage(html, sourceUrl);
  const image = resolveVenueImage(html);
  const pageClassification = classifySourcePageType(html, identity);

  let eventDate: string | null = null;
  let eventDateDisplay: string | null = null;
  if (!collection.isCollectionPage) {
    const jsonLd = safeExtract(() => extractFromJsonLd(html), warnings, "JSON-LD");
    const semanticHtml = safeExtract(() => extractFromSemanticHtml(html), warnings, "semantic HTML");
    const pageContent = safeExtract(() => extractFromPageContent(html, referenceDate), warnings, "page content fallback");
    const resolved = resolveEventDate(
      [jsonLd].filter((source): source is Partial<EventEnrichmentData> => Boolean(source)),
      [semanticHtml, pageContent].filter((source): source is Partial<EventEnrichmentData> => Boolean(source)),
      {},
      referenceDate
    );
    eventDate = resolved.eventDate;
    eventDateDisplay = resolved.eventDateDisplay;
  }

  return {
    venueName: identity.venueName,
    nameSource: identity.nameSource,
    rejectedNames: identity.rejectedNames,
    isCollectionPage: collection.isCollectionPage,
    collectionPageReason: collection.reason,
    city: identity.city,
    postalCode: identity.postalCode,
    country: identity.country,
    address: identity.address,
    locationSource: identity.locationSource,
    imageUrl: image.imageUrl,
    imageSource: image.imageSource,
    eventDate,
    eventDateDisplay,
    confidence: computeVenueConfidence(identity),
    warnings,
    pageType: pageClassification.pageType,
    isSingleEvent: pageClassification.isSingleEvent,
    isVenue: pageClassification.isVenue,
    pageTypeReason: pageClassification.reason
  };
}

// --- Event-detail link selection (for Output B: one opportunity per event) --

export function isSocialOrTicketingUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "");
    return [
      "instagram.com",
      "facebook.com",
      "youtube.com",
      "youtu.be",
      "ticketmaster.com",
      "dice.fm",
      "shotgun.live",
      "eventbrite.com"
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return true;
  }
}

/**
 * Selects same-origin candidate event-detail links from a listing page's own
 * link list, excluding the listing page itself (and pagination/query
 * variants of it), social/ticketing domains, and non-http(s) links. Bounded
 * to maxLinks so a single search can never trigger an unbounded crawl.
 */
export function selectEventDetailLinks(links: string[], agendaUrl: string, maxLinks: number): string[] {
  let origin: string;
  let agendaPath: string;
  try {
    const parsed = new URL(agendaUrl);
    origin = parsed.origin;
    agendaPath = parsed.pathname;
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const selected: string[] = [];

  for (const link of links) {
    if (selected.length >= maxLinks) break;
    let parsed: URL;
    try {
      parsed = new URL(link, origin);
    } catch {
      continue;
    }
    if (parsed.origin !== origin) continue;
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (parsed.pathname === agendaPath) continue;
    if (isSocialOrTicketingUrl(parsed.href)) continue;
    const key = `${parsed.origin}${parsed.pathname}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(parsed.href);
  }

  return selected;
}
