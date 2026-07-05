const MIN_MEANINGFUL_TEXT_LENGTH = 200;
const MIN_WORD_COUNT = 30;

/**
 * Strips scripts, styles, tags, and excess whitespace from raw HTML,
 * producing plain text suitable for chunking and embedding.
 */
export function cleanHtmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const withoutTags = withoutScripts
    .replace(/<(br|p|div|li|tr|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(withoutTags)
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*\n+/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

export function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) {
    return null;
  }
  const title = decodeHtmlEntities(match[1]).replace(/\s+/g, " ").trim();
  return title || null;
}

/**
 * Returns true when the extracted text is too short or too repetitive
 * to be a real document (empty pages, cookie banners, boilerplate shells).
 */
export function isEmptyOrBoilerplateText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_MEANINGFUL_TEXT_LENGTH) {
    return true;
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_WORD_COUNT) {
    return true;
  }

  const uniqueWords = new Set(trimmed.toLowerCase().split(/\s+/).filter(Boolean));
  if (uniqueWords.size < wordCount * 0.2) {
    return true;
  }

  return false;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}
