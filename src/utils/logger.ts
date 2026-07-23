export type DebugScope = "spotify" | "lastfm" | "musicbrainz" | "wikidata" | "firecrawl" | "web-search" | "artist-verification" | "artist-consolidation" | "similar-artists" | "seeds" | "profile" | "youtube" | "events" | "pipeline" | "booking" | "genre" | "sources" | "enrichment" | "concert-history" | "ticketmaster" | "openai-concerts";

const DEBUG_FLAG_BY_SCOPE: Record<DebugScope, string> = {
  spotify: "DEBUG_SPOTIFY",
  lastfm: "DEBUG_LASTFM",
  musicbrainz: "DEBUG_MUSICBRAINZ",
  wikidata: "DEBUG_WIKIDATA",
  firecrawl: "DEBUG_FIRECRAWL",
  "web-search": "DEBUG_WEB_SEARCH",
  "artist-verification": "DEBUG_ARTIST_VERIFICATION",
  "artist-consolidation": "DEBUG_ARTIST_CONSOLIDATION",
  "similar-artists": "DEBUG_SIMILAR_ARTISTS",
  seeds: "DEBUG_SEEDS",
  profile: "DEBUG_PROFILE",
  youtube: "DEBUG_YOUTUBE",
  events: "DEBUG_EVENTS",
  pipeline: "DEBUG_PIPELINE",
  booking: "DEBUG_BOOKING",
  genre: "DEBUG_GENRE",
  sources: "DEBUG_SOURCES",
  enrichment: "DEBUG_ENRICHMENT",
  "concert-history": "DEBUG_ARTIST_CONCERTS",
  ticketmaster: "DEBUG_TICKETMASTER_CONCERTS",
  "openai-concerts": "DEBUG_OPENAI_CONCERTS"
};

export function isDebugEnabled(scope: DebugScope): boolean {
  return normalizeFlagValue(process.env[DEBUG_FLAG_BY_SCOPE[scope]]) === "true";
}

export function debugLog(scope: DebugScope, message: string, data?: unknown): void {
  if (!isDebugEnabled(scope)) {
    return;
  }

  console.log(formatLog(scope, message, data));
}

export function warnLog(scope: DebugScope, message: string, data?: unknown): void {
  console.warn(formatLog(scope, message, data));
}

function formatLog(scope: DebugScope, message: string, data?: unknown): string {
  if (typeof data === "undefined") {
    return `[${scope}] ${message}`;
  }

  return `[${scope}] ${message} ${safeStringify(data)}`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(sanitizeValue(value));
  } catch {
    return JSON.stringify("[unserializable]");
  }
}

function sanitizeValue(value: unknown, key?: string, seen = new WeakSet<object>()): unknown {
  if (typeof key === "string" && shouldRedactKey(key)) {
    return "[redacted]";
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return shouldRedactString(value) ? "[redacted]" : value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "undefined") {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return sanitizeValue(
      {
        name: value.name,
        message: value.message
      },
      undefined,
      seen
    );
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, undefined, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) {
      return "[circular]";
    }

    seen.add(value as object);

    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      output[childKey] = sanitizeValue(childValue, childKey, seen);
    }

    return output;
  }

  return String(value);
}

function shouldRedactKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return (
    normalized === "authorization" ||
    normalized.includes("authorization") ||
    normalized.includes("api_key") ||
    normalized.includes("apikey") ||
    normalized.includes("client_secret") ||
    normalized.includes("clientsecret") ||
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("password")
  );
}

function shouldRedactString(value: string): boolean {
  const trimmed = value.trim();
  return /^(bearer|basic)\s+/i.test(trimmed);
}

function normalizeFlagValue(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}
