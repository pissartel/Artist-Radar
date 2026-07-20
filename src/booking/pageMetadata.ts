import { decodeHtmlEntities } from "../utils/htmlEntities.js";

// Best-effort extraction of page-level metadata (title, description, poster
// image, announced performers) from a fetched HTML page. Used to enrich scene
// agenda listings whose raw title/description are unusable (see
// titleNormalization.ts), without ever fabricating a value: every field is
// null when the page doesn't expose it.

export interface PageMetadata {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  performers: string[];
}

const OG_IMAGE_PATTERN = /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i;
const TWITTER_IMAGE_PATTERN = /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i;
const OG_TITLE_PATTERN = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i;
const OG_DESCRIPTION_PATTERN = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i;
const META_DESCRIPTION_PATTERN = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i;
const TITLE_TAG_PATTERN = /<title[^>]*>([\s\S]*?)<\/title>/i;
const JSON_LD_PATTERN = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Extracts og:image/twitter:image/JSON-LD image, title, description and performer names from raw page HTML. Never throws. */
export function extractPageMetadata(html: string): PageMetadata {
  const jsonLd = extractJsonLdEvent(html);

  const title = decodeAttr(matchAttr(OG_TITLE_PATTERN, html)) ?? decodeAttr(matchAttr(TITLE_TAG_PATTERN, html));
  const description =
    decodeAttr(matchAttr(OG_DESCRIPTION_PATTERN, html)) ??
    decodeAttr(matchAttr(META_DESCRIPTION_PATTERN, html)) ??
    (jsonLd?.description ? decodeHtmlEntities(jsonLd.description) : null);
  const imageUrl =
    sanitizeImageUrl(matchAttr(OG_IMAGE_PATTERN, html)) ??
    sanitizeImageUrl(matchAttr(TWITTER_IMAGE_PATTERN, html)) ??
    sanitizeImageUrl(jsonLd?.image ?? null);

  return {
    title: title || null,
    description: description || null,
    imageUrl,
    performers: jsonLd?.performers ?? []
  };
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
  description: string | null;
  image: string | null;
  performers: string[];
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
          description: typeof candidate.description === "string" ? candidate.description : null,
          image: extractJsonLdImage(candidate.image),
          performers: extractJsonLdPerformers(candidate.performer)
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
