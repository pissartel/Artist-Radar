import { normalizeBookingSource } from "../normalizeBookingTarget.js";
import type { BookingTargetCategory, RawBookingSource } from "../types.js";
import type { BookingSourceProvider } from "./BookingSourceProvider.js";

type FetchLike = typeof fetch;

export interface OpenAgendaBookingSourceProviderEnv {
  ENABLE_OPENAGENDA_BOOKING?: string;
  OPENAGENDA_API_KEY?: string;
  OPENAGENDA_AGENDA_UID?: string;
  OPENAGENDA_BASE_URL?: string;
}

export interface OpenAgendaBookingSourceProviderOptions {
  env?: OpenAgendaBookingSourceProviderEnv;
  fetchImpl?: FetchLike;
}

interface OpenAgendaEvent {
  uid?: string | number;
  title?: string | Record<string, string | undefined> | null;
  description?: string | Record<string, string | undefined> | null;
  longDescription?: string | Record<string, string | undefined> | null;
  html?: string | Record<string, string | undefined> | null;
  url?: string | null;
  canonicalUrl?: string | null;
  registrationUrl?: string | null;
  keywords?: string[];
  tags?: string[];
  location?: {
    name?: string | null;
    city?: string | null;
    country?: string | null;
  } | null;
  firstTiming?: {
    begin?: string | null;
    end?: string | null;
  } | null;
  timings?: Array<{
    begin?: string | null;
    end?: string | null;
  }>;
}

interface OpenAgendaResponse {
  events?: OpenAgendaEvent[];
  data?: OpenAgendaEvent[];
  total?: number;
}

export function buildOpenAgendaBookingSourceProvider(
  options: OpenAgendaBookingSourceProviderOptions = {}
): BookingSourceProvider {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const providerName = "openagenda_booking";

  return {
    providerName,
    async search({ input, maxResults }) {
      const enabled = env.ENABLE_OPENAGENDA_BOOKING === "true";
      const agendaUid = env.OPENAGENDA_AGENDA_UID;
      const apiKey = env.OPENAGENDA_API_KEY;
      if (!enabled) {
        return {
          sourceProvider: providerName,
          searchedQueries: [],
          targets: [],
          warnings: ["OpenAgenda booking provider is disabled. Set ENABLE_OPENAGENDA_BOOKING=true with OPENAGENDA_AGENDA_UID and OPENAGENDA_API_KEY to enable it."],
          metadata: { enabled: false, reason: "disabled" }
        };
      }
      if (!agendaUid || !apiKey) {
        return {
          sourceProvider: providerName,
          searchedQueries: [],
          targets: [],
          warnings: ["OpenAgenda booking provider is enabled but missing OPENAGENDA_AGENDA_UID or OPENAGENDA_API_KEY."],
          metadata: { enabled: false, reason: "missing_config" }
        };
      }

      const query = buildOpenAgendaQuery(input.genre, input.city, input.target ?? null);
      const endpoint = buildOpenAgendaUrl(env.OPENAGENDA_BASE_URL, agendaUid, query, Math.min(maxResults ?? input.limit, input.limit));

      try {
        const response = await fetchImpl(endpoint, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json"
          }
        });
        if (!response.ok) {
          return {
            sourceProvider: providerName,
            searchedQueries: [query],
            targets: [],
            warnings: [`OpenAgenda request failed with HTTP ${response.status}.`],
            metadata: { enabled: true, status: response.status }
          };
        }

        const body = (await response.json()) as OpenAgendaResponse;
        const events = body.events ?? body.data ?? [];
        return {
          sourceProvider: providerName,
          searchedQueries: [query],
          targets: events.flatMap((event) => {
            const normalized = normalizeBookingSource(openAgendaEventToRawSource(event, input.city));
            return normalized ? [normalized] : [];
          }),
          warnings: [],
          metadata: { enabled: true, total: body.total ?? events.length }
        };
      } catch (error) {
        return {
          sourceProvider: providerName,
          searchedQueries: [query],
          targets: [],
          warnings: [`OpenAgenda request failed: ${error instanceof Error ? error.message : String(error)}`],
          metadata: { enabled: true, errorName: error instanceof Error ? error.name : "Error" }
        };
      }
    }
  };
}

function buildOpenAgendaQuery(genre: string, city: string, target: string | null): string {
  return [genre, city, target].filter(Boolean).join(" ");
}

function buildOpenAgendaUrl(baseUrl: string | undefined, agendaUid: string, query: string, limit: number): string {
  const url = new URL(`${baseUrl ?? "https://api.openagenda.com"}/v2/agendas/${encodeURIComponent(agendaUid)}/events`);
  url.searchParams.set("search", query);
  url.searchParams.set("size", String(Math.max(1, Math.min(limit, 20))));
  return url.toString();
}

function openAgendaEventToRawSource(event: OpenAgendaEvent, fallbackCity: string): RawBookingSource {
  const title = localizedText(event.title) ?? `OpenAgenda event ${event.uid ?? ""}`.trim();
  const description = [
    localizedText(event.description),
    localizedText(event.longDescription),
    localizedText(event.html),
    ...(event.keywords ?? []),
    ...(event.tags ?? [])
  ].filter(Boolean).join(" ");
  const sourceUrl = event.canonicalUrl ?? event.url ?? event.registrationUrl ?? null;

  return {
    name: title,
    category: classifyOpenAgendaCategory(title, description),
    sourceUrl,
    url: sourceUrl,
    sourceType: "openagenda",
    city: event.location?.city ?? fallbackCity,
    country: event.location?.country ?? null,
    text: description,
    links: [event.registrationUrl, event.url, event.canonicalUrl].filter((url): url is string => Boolean(url)),
    genres: [...(event.keywords ?? []), ...(event.tags ?? [])],
    confidence: sourceUrl ? 0.74 : 0.45,
    eventDate: event.firstTiming?.begin ?? event.timings?.[0]?.begin ?? null
  };
}

function classifyOpenAgendaCategory(title: string, description: string): BookingTargetCategory {
  const text = `${title} ${description}`;
  if (/\b(appel à candidature|appel a candidature|open call|candidatures?|apply|registration)\b/i.test(text)) {
    return "open_call";
  }
  if (/\b(tremplin|springboard|concours)\b/i.test(text)) {
    return "springboard";
  }
  if (/\b(festival|fest|open air)\b/i.test(text)) {
    return "festival";
  }
  return "event";
}

function localizedText(value: OpenAgendaEvent["title"]): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value.fr ?? value.en ?? Object.values(value).find((entry): entry is string => Boolean(entry)) ?? null;
}
