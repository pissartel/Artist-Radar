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

  const title = pick("title", null) ?? buildGenericTitle(options, fieldSources);
  const eventDateResolution = resolveEventDate(structuredSources, contentSources, options, referenceDate);
  if (eventDateResolution.tier) {
    fieldSources.eventDate = eventDateResolution.tier;
  }

  const extracted: ExtractedEventPageData = {
    title,
    description: pick("description", null),
    eventDate: eventDateResolution.eventDate,
    eventDateDisplay: eventDateResolution.eventDateDisplay,
    doorsTime: pick("doorsTime", null),
    venueName: pick("venueName", null),
    city: pick("city", null),
    address: pick("address", null),
    headliners: pick("headliners", []),
    lineup: pick("lineup", []),
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

function extractFromJsonLd(html: string): Partial<EventEnrichmentData> | null {
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

  const candidates = blocks.flatMap((block) => flattenJsonLdGraph(block));
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

function extractJsonLdAddress(location: unknown): { city: string | null; line: string | null } {
  if (!location || typeof location !== "object") return { city: null, line: null };
  const address = (location as Record<string, unknown>).address;
  if (typeof address === "string") return { city: null, line: address };
  if (address && typeof address === "object") {
    const addressRecord = address as Record<string, unknown>;
    const city = asString(addressRecord.addressLocality);
    const parts = [addressRecord.streetAddress, addressRecord.postalCode, addressRecord.addressLocality]
      .map((part) => asString(part))
      .filter((part): part is string => Boolean(part));
    return { city, line: parts.length > 0 ? parts.join(", ") : null };
  }
  return { city: null, line: null };
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

function extractFromSemanticHtml(html: string): Partial<EventEnrichmentData> | null {
  const eventDate = html.match(TIME_TAG_PATTERN)?.[1] ?? null;
  const addressMatch = html.match(ADDRESS_TAG_PATTERN)?.[1];
  const address = addressMatch ? stripTags(addressMatch) : null;
  const contactEmail = html.match(MAILTO_PATTERN)?.[1]?.trim() ?? null;
  const ticketUrl = html.match(TICKET_LINK_PATTERN)?.[1] ?? null;
  const contactFormUrl = html.match(CONTACT_LINK_PATTERN)?.[1] ?? null;
  const posterMatch = html.match(POSTER_IMG_PATTERN);
  const posterImageUrl = posterMatch ? posterMatch[1] ?? posterMatch[2] ?? null : null;

  if (!eventDate && !address && !contactEmail && !ticketUrl && !contactFormUrl && !posterImageUrl) {
    return null;
  }

  return {
    eventDate,
    address,
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
