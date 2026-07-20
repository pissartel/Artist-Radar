import { decodeHtmlEntities } from "../utils/htmlEntities.js";

// Best-effort extraction of page-level metadata (title, description, poster
// image, announced performers, ticket URL) from a fetched HTML page. Used to
// enrich scene agenda listings whose raw title/description are unusable (see
// titleNormalization.ts), without ever fabricating a value: every field is
// null when the page doesn't expose it.

export interface PageMetadata {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  performers: string[];
  ticketUrl: string | null;
}

// Real-world pages emit <meta> attributes in either order (e.g. WordPress/CMS
// output frequently puts content= before property=), so meta tags are parsed
// attribute-by-attribute rather than with an order-dependent regex — an
// order-dependent match silently drops a real og:title/og:image and falls
// through to a generic fallback (issue #130 review feedback: the Razibus
// example title/poster were present on the page but not being extracted).
const META_TAG_PATTERN = /<meta\b[^>]*>/gi;
const META_ATTR_PATTERN = /([a-zA-Z][a-zA-Z0-9:_-]*)\s*=\s*"([^"]*)"|([a-zA-Z][a-zA-Z0-9:_-]*)\s*=\s*'([^']*)'/g;
const TITLE_TAG_PATTERN = /<title[^>]*>([\s\S]*?)<\/title>/i;
const JSON_LD_PATTERN = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Extracts og:image/twitter:image/JSON-LD image, title, description, performer names and ticket URL from raw page HTML. Never throws. */
export function extractPageMetadata(html: string): PageMetadata {
  const jsonLd = extractJsonLdEvent(html);
  const metaTags = extractMetaTags(html);

  const title =
    decodeAttr(findMetaContent(metaTags, ["og:title"])) ??
    decodeAttr(jsonLd?.name ?? null) ??
    decodeAttr(matchAttr(TITLE_TAG_PATTERN, html));
  const description =
    decodeAttr(findMetaContent(metaTags, ["og:description"])) ??
    decodeAttr(findMetaContent(metaTags, ["description"])) ??
    (jsonLd?.description ? decodeHtmlEntities(jsonLd.description) : null);
  const imageUrl =
    sanitizeImageUrl(findMetaContent(metaTags, ["og:image", "og:image:secure_url"])) ??
    sanitizeImageUrl(findMetaContent(metaTags, ["twitter:image", "twitter:image:src"])) ??
    sanitizeImageUrl(jsonLd?.image ?? null);
  const ticketUrl = sanitizeImageUrl(jsonLd?.offerUrl ?? null);

  return {
    title: title || null,
    description: description || null,
    imageUrl,
    performers: jsonLd?.performers ?? [],
    ticketUrl
  };
}

/** Parses every <meta> tag in the document into a lowercase-keyed attribute map, tolerant of attribute order. */
function extractMetaTags(html: string): Array<Record<string, string>> {
  const tags: Array<Record<string, string>> = [];
  for (const tagMatch of html.matchAll(META_TAG_PATTERN)) {
    const attrs: Record<string, string> = {};
    for (const attrMatch of tagMatch[0].matchAll(META_ATTR_PATTERN)) {
      const name = (attrMatch[1] ?? attrMatch[3])?.toLowerCase();
      const value = attrMatch[2] ?? attrMatch[4] ?? "";
      if (name) attrs[name] = value;
    }
    tags.push(attrs);
  }
  return tags;
}

/** Returns the content= of the first <meta> tag whose name=/property= matches one of the given keys (case-insensitive). */
function findMetaContent(metaTags: Array<Record<string, string>>, keys: string[]): string | null {
  const normalizedKeys = keys.map((key) => key.toLowerCase());
  for (const attrs of metaTags) {
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (normalizedKeys.includes(key) && typeof attrs.content === "string") {
      return attrs.content;
    }
  }
  return null;
}

function matchAttr(pattern: RegExp, html: string): string | null {
  return html.match(pattern)?.[1] ?? null;
}

function decodeAttr(value: string | null): string | null {
  if (!value) return null;
  const decoded = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  return decoded || null;
}

/** Only accepts absolute http(s) image URLs; rejects data: URIs and other unsafe schemes. */
function sanitizeImageUrl(value: string | null): string | null {
  if (!value) return null;
  const decoded = decodeHtmlEntities(value).trim();
  try {
    const url = new URL(decoded);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

interface JsonLdEvent {
  name: string | null;
  description: string | null;
  image: string | null;
  performers: string[];
  offerUrl: string | null;
}

function extractJsonLdEvent(html: string): JsonLdEvent | null {
  const blocks = [...html.matchAll(JSON_LD_PATTERN)].map((match) => match[1]);
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block.trim());
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        const type = candidate?.["@type"];
        const isEvent = type === "Event" || (Array.isArray(type) && type.includes("Event"));
        if (!isEvent) continue;
        return {
          name: typeof candidate.name === "string" ? candidate.name : null,
          description: typeof candidate.description === "string" ? candidate.description : null,
          image: extractJsonLdImage(candidate.image),
          performers: extractJsonLdPerformers(candidate.performer),
          offerUrl: extractJsonLdOfferUrl(candidate.offers)
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function extractJsonLdImage(image: unknown): string | null {
  if (typeof image === "string") return image;
  if (Array.isArray(image) && typeof image[0] === "string") return image[0];
  if (image && typeof image === "object" && typeof (image as { url?: unknown }).url === "string") {
    return (image as { url: string }).url;
  }
  return null;
}

function extractJsonLdPerformers(performer: unknown): string[] {
  const entries = Array.isArray(performer) ? performer : performer ? [performer] : [];
  return entries
    .map((entry) => (typeof entry === "string" ? entry : (entry as { name?: unknown })?.name))
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    .map((name) => name.trim());
}

/** Extracts the ticket/booking URL from a schema.org Offer (or list of Offers). Never guessed: null when absent. */
function extractJsonLdOfferUrl(offers: unknown): string | null {
  const entries = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const entry of entries) {
    const url = (entry as { url?: unknown })?.url;
    if (typeof url === "string" && url.trim().length > 0) return url;
  }
  return null;
}
