export interface InstagramHandleExtractionInput {
  content: string;
  sourceUrl?: string | null;
}

export interface InstagramHandleExtraction {
  handle: string;
  url: string;
  sourceUrl: string | null;
  confidence: number;
}

const INSTAGRAM_URL_PATTERN =
  /\b(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-z0-9._]+)(?:[/?#][^\s"'<>)]*)?/gi;

const GENERIC_INSTAGRAM_PATHS = new Set([
  "about",
  "accounts",
  "developer",
  "direct",
  "explore",
  "graphql",
  "legal",
  "oauth",
  "p",
  "privacy",
  "reel",
  "stories",
  "terms",
  "tv"
]);

const INSTAGRAM_HANDLE_PATTERN = /^[a-z0-9._]{1,30}$/;

export class InstagramHandleExtractor {
  extract(input: InstagramHandleExtractionInput): InstagramHandleExtraction[] {
    const sourceUrl = input.sourceUrl ?? null;
    const matches = new Map<string, InstagramHandleExtraction>();

    for (const match of input.content.matchAll(INSTAGRAM_URL_PATTERN)) {
      const handle = normalizeInstagramHandle(match[1]);
      if (!handle || matches.has(handle)) {
        continue;
      }

      matches.set(handle, {
        handle,
        url: normalizeInstagramHandleUrl(handle),
        sourceUrl,
        confidence: 0.9
      });
    }

    return [...matches.values()];
  }
}

export function extractInstagramHandles(input: InstagramHandleExtractionInput): InstagramHandleExtraction[] {
  return new InstagramHandleExtractor().extract(input);
}

export function normalizeInstagramHandle(rawHandle: string): string | null {
  const handle = rawHandle.trim().toLowerCase().replace(/[.,;:!]+$/g, "");

  if (!INSTAGRAM_HANDLE_PATTERN.test(handle) || GENERIC_INSTAGRAM_PATHS.has(handle)) {
    return null;
  }

  return handle;
}

export function normalizeInstagramHandleUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
}
