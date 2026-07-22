import { OPENAGENDA_LOCATION_SEEDS, type OpenAgendaLocationSeed } from "../config/openAgendaSeeds.js";
import {
  discoverAgendas,
  fetchOpenAgenda,
  findMatchingOpenAgendaSeeds,
  firstText,
  localizedText,
  parseAgendaUids,
  type OpenAgendaEvent,
  type SelectedOpenAgendaAgenda
} from "./OpenAgendaBookingSourceProvider.js";
import type { ArtistEventHistoryProvider, HistoricalArtistEvent } from "../artistEventHistory.js";
import type { BookingSearchInput } from "../types.js";
import { warnLog } from "../../utils/logger.js";

type FetchLike = typeof fetch;

export interface OpenAgendaArtistEventHistoryProviderEnv {
  ENABLE_OPENAGENDA?: string;
  ENABLE_OPENAGENDA_BOOKING?: string;
  OPENAGENDA_API_KEY?: string;
  OPENAGENDA_AGENDA_UIDS?: string;
  OPENAGENDA_AGENDA_UID?: string;
  OPENAGENDA_BASE_URL?: string;
}

export interface OpenAgendaArtistEventHistoryProviderOptions {
  env?: OpenAgendaArtistEventHistoryProviderEnv;
  fetchImpl?: FetchLike;
  seeds?: OpenAgendaLocationSeed[];
  maxAgendasPerArtist?: number;
}

interface OpenAgendaEventsResponse {
  events?: OpenAgendaEvent[];
  data?: OpenAgendaEvent[];
}

export function isOpenAgendaArtistEventHistoryEnabled(env: OpenAgendaArtistEventHistoryProviderEnv = process.env): boolean {
  return (env.ENABLE_OPENAGENDA === "true" || env.ENABLE_OPENAGENDA_BOOKING === "true") && Boolean(env.OPENAGENDA_API_KEY);
}

/**
 * Structured concert-history provider backed by OpenAgenda (issue #182).
 * Reuses the same agenda discovery/config-override resolution as
 * OpenAgendaBookingSourceProvider so this adapter never re-implements
 * location-to-agenda matching. Agenda resolution is memoized per resolved
 * location for the lifetime of this provider instance (one booking search),
 * so the ~30-query agenda discovery only runs once per country even though
 * findPastEvents is called once per similar artist.
 */
export function buildOpenAgendaArtistEventHistoryProvider(
  options: OpenAgendaArtistEventHistoryProviderOptions = {}
): ArtistEventHistoryProvider {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const seeds = options.seeds ?? OPENAGENDA_LOCATION_SEEDS;
  const maxAgendasPerArtist = options.maxAgendasPerArtist ?? 5;
  const agendaCache = new Map<string, Promise<SelectedOpenAgendaAgenda[]>>();

  return {
    providerName: "openagenda_event_history",
    async findPastEvents({ artistName, countries, dateFrom, dateTo }) {
      const apiKey = env.OPENAGENDA_API_KEY;
      if (!isOpenAgendaArtistEventHistoryEnabled(env) || !apiKey) {
        return [];
      }

      const locations = countries && countries.length > 0 ? countries : ["France"];
      const cacheKey = [...locations].sort().join("|");
      if (!agendaCache.has(cacheKey)) {
        agendaCache.set(
          cacheKey,
          resolveAgendas({
            apiKey,
            baseUrl: env.OPENAGENDA_BASE_URL,
            fetchImpl,
            locations,
            seeds,
            configuredAgendaUids: parseAgendaUids(env.OPENAGENDA_AGENDA_UIDS ?? env.OPENAGENDA_AGENDA_UID)
          })
        );
      }

      const agendas = await agendaCache.get(cacheKey)!;
      if (agendas.length === 0) {
        return [];
      }

      const events: HistoricalArtistEvent[] = [];
      let attempted = 0;
      let lastError: unknown = null;

      for (const agenda of agendas.slice(0, maxAgendasPerArtist)) {
        attempted += 1;
        try {
          const response = await fetchOpenAgenda(
            buildArtistEventsUrl(env.OPENAGENDA_BASE_URL, agenda.uid, artistName, dateFrom, dateTo),
            apiKey,
            fetchImpl
          );
          if (!response.ok) {
            warnLog("booking", `OpenAgenda event history request failed with HTTP ${response.status} for agenda ${agenda.uid}, artist "${artistName}".`);
            continue;
          }
          const body = (await response.json()) as OpenAgendaEventsResponse;
          const agendaEvents = body.events ?? body.data ?? [];
          for (const event of agendaEvents) {
            const mapped = toHistoricalArtistEvent(event, artistName, agenda);
            if (mapped) {
              events.push(mapped);
            }
          }
        } catch (error) {
          lastError = error;
          warnLog("booking", `OpenAgenda event history request failed for agenda ${agenda.uid}, artist "${artistName}": ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Every agenda attempt failed outright (network/HTTP-level): rethrow so
      // the caller's Promise.allSettled records a structured diagnostic for
      // this artist/provider pair instead of silently returning "no events".
      // A partial success (some agendas failed, others returned data) is not
      // rethrown — the events already collected are real, sourced data.
      if (attempted > 0 && events.length === 0 && lastError) {
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }

      return events;
    }
  };
}

async function resolveAgendas({
  apiKey,
  baseUrl,
  fetchImpl,
  locations,
  seeds,
  configuredAgendaUids
}: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl: FetchLike;
  locations: string[];
  seeds: OpenAgendaLocationSeed[];
  configuredAgendaUids: string[];
}): Promise<SelectedOpenAgendaAgenda[]> {
  if (configuredAgendaUids.length > 0) {
    return configuredAgendaUids.map((uid) => buildManualAgenda(uid, "env_override"));
  }

  const matchedSeeds = findMatchingOpenAgendaSeeds(seeds, locations, null);
  const seedAgendaUids = uniqueStrings(matchedSeeds.flatMap((seed) => seed.agendaUids));
  if (seedAgendaUids.length > 0) {
    return seedAgendaUids.map((uid) => buildManualAgenda(uid, "seed"));
  }

  // No configured or seeded agendas: fall back to the same discovery used by
  // OpenAgendaBookingSourceProvider, scoped to the requested location(s). A
  // minimal synthetic input is enough since discovery only reads genre/target
  // for keyword generation, both generic here (this call is artist-name
  // driven, not genre driven).
  const syntheticInput: BookingSearchInput = {
    artist: "",
    city: locations[0] ?? "",
    genre: "concert",
    target: null,
    links: [],
    limit: 1
  };
  return discoverAgendas({
    apiKey,
    baseUrl,
    fetchImpl,
    input: syntheticInput,
    locations,
    seeds: matchedSeeds,
    searchedQueries: [],
    warnings: []
  });
}

function buildManualAgenda(uid: string, source: "env_override" | "seed"): SelectedOpenAgendaAgenda {
  return {
    uid,
    title: null,
    slug: null,
    official: null,
    sourceUrl: `https://openagenda.com/agendas/${uid}`,
    matchedQuery: null,
    matchedLocation: null,
    source
  };
}

function buildArtistEventsUrl(
  baseUrl: string | undefined,
  agendaUid: string,
  artistName: string,
  dateFrom: string | undefined,
  dateTo: string | undefined
): string {
  const url = new URL(`${baseUrl ?? "https://api.openagenda.com"}/v2/agendas/${encodeURIComponent(agendaUid)}/events`);
  url.searchParams.set("search", artistName);
  url.searchParams.set("size", "20");
  if (dateFrom) {
    url.searchParams.set("timings[gte]", `${dateFrom}T00:00:00.000Z`);
  }
  if (dateTo) {
    url.searchParams.set("timings[lte]", `${dateTo}T23:59:59.000Z`);
  }
  return url.toString();
}

function toHistoricalArtistEvent(
  event: OpenAgendaEvent,
  artistName: string,
  agenda: SelectedOpenAgendaAgenda
): HistoricalArtistEvent | null {
  const sourceUrl = firstText(event.canonicalUrl, event.url, event.registrationUrl);
  const venueName = event.location?.name?.trim() || null;
  if (!sourceUrl || !venueName) {
    return null;
  }

  return {
    artistName,
    eventName: localizedText(event.title) ?? null,
    eventDate: event.firstTiming?.begin ?? event.timings?.[0]?.begin ?? null,
    venueName,
    city: firstText(event.location?.city),
    country: firstText(event.location?.country),
    sourceUrl,
    sourceProvider: "openagenda",
    organizer: agenda.title,
    confidence: agenda.official ? 0.72 : 0.6
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
