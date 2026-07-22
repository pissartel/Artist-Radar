import { OPENAGENDA_LOCATION_SEEDS, type OpenAgendaLocationSeed } from "../config/openAgendaSeeds.js";
import {
  buildOpenAgendaAgendaSearchUrl,
  discoverAgendas,
  fetchOpenAgenda,
  findMatchingOpenAgendaSeeds,
  firstText,
  localizedText,
  parseAgendaUids,
  textList,
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
  // OpenAgendaBookingSourceProvider, scoped to the requested location(s),
  // PLUS a supplementary venue-focused agenda search. A live probe against
  // the real OpenAgenda API showed the shared discovery's scoring
  // (scoreAgenda in OpenAgendaBookingSourceProvider.ts) gives a location
  // text match alone enough score to reach its top-5 cut, so results are
  // often dominated by places whose name merely contains the location
  // (e.g. "Puiseux-en-France", "Info Jeunes France") ahead of real venues.
  // The supplementary search below, scoped to a venue-focused keyword
  // phrase and filtered by title before any ranking/truncation happens,
  // reliably surfaces real SMACs/clubs instead (Le Batofar, La Sirène, Le
  // Tamanoir, La Vapeur, Le 106, regional aggregators like LA MURMURE...).
  const syntheticInput: BookingSearchInput = {
    artist: "",
    city: locations[0] ?? "",
    genre: "salle de musiques actuelles SMAC club concerts programmation",
    target: null,
    links: [],
    limit: 1
  };
  const [discovered, supplementary] = await Promise.all([
    discoverAgendas({
      apiKey,
      baseUrl,
      fetchImpl,
      input: syntheticInput,
      locations,
      seeds: matchedSeeds,
      searchedQueries: [],
      warnings: []
    }),
    fetchVenueFocusedAgendas(apiKey, baseUrl, fetchImpl, locations)
  ]);

  // Extra precision safety net: only keep discovered agendas whose title
  // carries an actual live-music signal, dropping stragglers (e.g. a
  // department's generic civic listing) that the shared discovery query
  // may still surface. Not applied to env-override/seed agendas, which are
  // already explicit/trusted.
  const filteredDiscovered = discovered.filter((agenda) => !agenda.title || MUSIC_AGENDA_TITLE_PATTERN.test(agenda.title));

  return uniqueAgendasByUid([...supplementary, ...filteredDiscovered]).slice(0, 10);
}

const MUSIC_AGENDA_TITLE_PATTERN =
  /\b(concert|concerts|musique|musiques|music|festival|club|salle|scène|scene|live|smac|philharmonie|conservatoire|programmation)\b/i;

interface OpenAgendaAgendaSearchHit {
  uid?: string | number;
  title?: unknown;
  slug?: string | null;
  official?: boolean;
}

interface OpenAgendaAgendaSearchResponse {
  agendas?: OpenAgendaAgendaSearchHit[];
  data?: OpenAgendaAgendaSearchHit[];
}

// Searches directly for venue-focused agendas (bypassing the shared
// discovery's location-weighted scoring/truncation) and keeps only titles
// carrying a real live-music signal, checked before any ranking happens.
async function fetchVenueFocusedAgendas(
  apiKey: string,
  baseUrl: string | undefined,
  fetchImpl: FetchLike,
  locations: string[]
): Promise<SelectedOpenAgendaAgenda[]> {
  const results = await Promise.all(
    locations.slice(0, 3).map(async (location) => {
      try {
        const query = `${location} salle de musiques actuelles SMAC club concerts programmation`;
        const response = await fetchOpenAgenda(buildOpenAgendaAgendaSearchUrl(baseUrl, query, 10), apiKey, fetchImpl);
        if (!response.ok) {
          return [];
        }
        const body = (await response.json()) as OpenAgendaAgendaSearchResponse;
        return body.agendas ?? body.data ?? [];
      } catch {
        return [];
      }
    })
  );

  return results.flat().flatMap((hit): SelectedOpenAgendaAgenda[] => {
    const uid = hit.uid === undefined ? null : String(hit.uid).trim();
    const title = localizedText(hit.title as OpenAgendaEvent["title"]);
    if (!uid || !title || !MUSIC_AGENDA_TITLE_PATTERN.test(title)) {
      return [];
    }
    return [{
      uid,
      title,
      slug: hit.slug ?? null,
      official: typeof hit.official === "boolean" ? hit.official : null,
      sourceUrl: hit.slug ? `https://openagenda.com/${hit.slug}` : `https://openagenda.com/agendas/${uid}`,
      matchedQuery: null,
      matchedLocation: locations[0] ?? null,
      source: "discovery"
    }];
  });
}

function uniqueAgendasByUid(agendas: SelectedOpenAgendaAgenda[]): SelectedOpenAgendaAgenda[] {
  const seen = new Set<string>();
  return agendas.filter((agenda) => {
    if (seen.has(agenda.uid)) {
      return false;
    }
    seen.add(agenda.uid);
    return true;
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
  // Most events don't carry an external canonicalUrl/url/registrationUrl
  // (confirmed via a live probe against the real API), so slug and
  // originAgenda are requested to build a working openagenda.com event page
  // as a fallback real source (verified: https://openagenda.com/{agendaSlug}/events/{eventSlug} resolves).
  // description/longDescription/keywords are requested so the artist-name
  // verification below has real content to check, not just the title.
  for (const field of [
    "uid", "title", "description", "longDescription", "keywords", "location", "firstTiming", "timings",
    "url", "canonicalUrl", "registrationUrl", "slug", "originAgenda"
  ]) {
    url.searchParams.append("includeFields[]", field);
  }
  return url.toString();
}

function toHistoricalArtistEvent(
  event: OpenAgendaEvent,
  artistName: string,
  agenda: SelectedOpenAgendaAgenda
): HistoricalArtistEvent | null {
  // OpenAgenda's `search` parameter matches loosely on individual words, not
  // the artist name as a phrase (confirmed via a live probe: searching "Feu!
  // Chatterton" returned 17 events about fireworks/ceramics/traffic lights —
  // 0 of which actually mentioned the band, all matched on the standalone
  // word "feu"/fire). Every candidate must be re-verified here: the artist
  // name must actually appear in the event's own title/description/keywords,
  // or it's discarded rather than kept as an unverified, misleading match.
  if (!eventMentionsArtist(event, artistName)) {
    return null;
  }

  const constructedUrl = buildOpenAgendaEventPageUrl(event, agenda);
  const sourceUrl = firstText(event.canonicalUrl, event.url, event.registrationUrl) ?? constructedUrl;
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

function eventMentionsArtist(event: OpenAgendaEvent, artistName: string): boolean {
  const normalizedArtistName = normalizeForMatch(artistName);
  if (!normalizedArtistName) {
    return false;
  }
  const text = normalizeForMatch([
    localizedText(event.title) ?? "",
    localizedText(event.description) ?? "",
    localizedText(event.longDescription) ?? "",
    ...textList(event.keywords)
  ].join(" "));
  return text.includes(normalizedArtistName);
}

// Lowercases, strips accents and collapses punctuation to spaces so minor
// formatting differences ("Feu! Chatterton" vs "Feu Chatterton") don't cause
// a genuine mention to be missed, without loosening the match into a
// word-by-word/fuzzy one like OpenAgenda's own search does.
function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Builds a real, dereferenceable OpenAgenda event page from the event's own
// slug plus its owning agenda's slug (the queried agenda, or, when the event
// was surfaced through an aggregator, the event's originAgenda). Returns
// null rather than guessing when a slug is missing on either side, per
// AGENTS.md — never invent a source URL.
function buildOpenAgendaEventPageUrl(event: OpenAgendaEvent, agenda: SelectedOpenAgendaAgenda): string | null {
  if (!event.slug) {
    return null;
  }
  const agendaSlug = event.originAgenda?.slug ?? agenda.slug;
  if (!agendaSlug) {
    return null;
  }
  return `https://openagenda.com/${agendaSlug}/events/${event.slug}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
