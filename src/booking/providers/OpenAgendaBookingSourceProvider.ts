import { normalizeBookingSource } from "../normalizeBookingTarget.js";
import { OPENAGENDA_LOCATION_SEEDS, type OpenAgendaLocationSeed } from "../config/openAgendaSeeds.js";
import type { BookingSearchInput, BookingTargetCategory, RawBookingSource } from "../types.js";
import type { BookingSourceProvider } from "./BookingSourceProvider.js";
import { warnLog } from "../../utils/logger.js";

type FetchLike = typeof fetch;

export interface OpenAgendaBookingSourceProviderEnv {
  ENABLE_OPENAGENDA?: string;
  ENABLE_OPENAGENDA_BOOKING?: string;
  OPENAGENDA_API_KEY?: string;
  OPENAGENDA_AGENDA_UIDS?: string;
  OPENAGENDA_AGENDA_UID?: string;
  OPENAGENDA_DISCOVER_ADDITIONAL_AGENDAS?: string;
  OPENAGENDA_BASE_URL?: string;
}

export interface OpenAgendaBookingSourceProviderOptions {
  env?: OpenAgendaBookingSourceProviderEnv;
  fetchImpl?: FetchLike;
  seeds?: OpenAgendaLocationSeed[];
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

interface OpenAgendaAgenda {
  uid?: string | number;
  slug?: string | null;
  title?: string | Record<string, string | undefined> | null;
  description?: string | Record<string, string | undefined> | null;
  summary?: string | Record<string, string | undefined> | null;
  official?: boolean;
}

interface OpenAgendaEventResponse {
  events?: OpenAgendaEvent[];
  data?: OpenAgendaEvent[];
  total?: number;
}

interface OpenAgendaAgendaResponse {
  agendas?: OpenAgendaAgenda[];
  data?: OpenAgendaAgenda[];
  total?: number;
}

interface SelectedOpenAgendaAgenda {
  uid: string;
  title: string | null;
  slug: string | null;
  official: boolean | null;
  sourceUrl: string;
  matchedQuery: string | null;
  matchedLocation: string | null;
  source: "env_override" | "seed" | "discovery";
}

interface OpenAgendaEventResult {
  agenda: SelectedOpenAgendaAgenda;
  event: OpenAgendaEvent;
}

export function buildOpenAgendaBookingSourceProvider(
  options: OpenAgendaBookingSourceProviderOptions = {}
): BookingSourceProvider {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const seeds = options.seeds ?? OPENAGENDA_LOCATION_SEEDS;
  const providerName = "openagenda_booking";

  return {
    providerName,
    async search({ input, maxResults }) {
      const enabled = isOpenAgendaEnabled(env);
      const apiKey = env.OPENAGENDA_API_KEY;
      const configuredAgendaUids = parseAgendaUids(env.OPENAGENDA_AGENDA_UIDS ?? env.OPENAGENDA_AGENDA_UID);

      if (!enabled) {
        return {
          sourceProvider: providerName,
          searchedQueries: [],
          targets: [],
          warnings: ["OpenAgenda booking provider is disabled. Set ENABLE_OPENAGENDA=true with OPENAGENDA_API_KEY to enable it."],
          metadata: { enabled: false, reason: "disabled" }
        };
      }

      if (!apiKey) {
        return {
          sourceProvider: providerName,
          searchedQueries: [],
          targets: [],
          warnings: ["OpenAgenda booking provider is enabled but missing OPENAGENDA_API_KEY."],
          metadata: { enabled: false, reason: "missing_api_key" }
        };
      }

      const discoveryLocations = buildOpenAgendaLocations(input);
      const matchedSeeds = findMatchingOpenAgendaSeeds(seeds, discoveryLocations, input.target ?? null);
      const seedAgendaUids = configuredAgendaUids.length > 0
        ? []
        : uniqueStrings(matchedSeeds.flatMap((seed) => seed.agendaUids));
      const discoveryQueries: string[] = [];
      const warnings: string[] = [];
      const shouldDiscover = configuredAgendaUids.length === 0 || env.OPENAGENDA_DISCOVER_ADDITIONAL_AGENDAS === "true";
      const overrideAgendas = configuredAgendaUids.map((uid): SelectedOpenAgendaAgenda => ({
            uid,
            title: null,
            slug: null,
            official: null,
            sourceUrl: buildAgendaSourceUrl(uid, null),
            matchedQuery: null,
            matchedLocation: null,
            source: "env_override"
      }));
      const seedAgendas = seedAgendaUids.map((uid): SelectedOpenAgendaAgenda => ({
        uid,
        title: null,
        slug: null,
        official: null,
        sourceUrl: buildAgendaSourceUrl(uid, null),
        matchedQuery: null,
        matchedLocation: null,
        source: "seed"
      }));
      const discoveredAgendas = shouldDiscover && seedAgendas.length === 0
        ? await discoverAgendas({
            apiKey,
            baseUrl: env.OPENAGENDA_BASE_URL,
            fetchImpl,
            input,
            locations: discoveryLocations,
            seeds: matchedSeeds,
            searchedQueries: discoveryQueries,
            warnings
          })
        : [];
      const selectedAgendas = uniqueAgendas([...overrideAgendas, ...seedAgendas, ...discoveredAgendas]);

      if (discoveredAgendas.length > 0) {
        warnings.push(`OpenAgenda discovered agenda UIDs for future seed review: ${discoveredAgendas.map((agenda) => agenda.uid).join(", ")}.`);
      }

      if (selectedAgendas.length === 0) {
        const result = {
          sourceProvider: providerName,
          searchedQueries: discoveryQueries,
          targets: [],
          warnings: uniqueStrings([
            ...warnings,
            "OpenAgenda agenda discovery found no relevant public agendas for the requested location."
          ]),
          metadata: buildOpenAgendaMetadata({
            configuredAgendaUids,
            discoveryLocations,
            seedLocationKeys: matchedSeeds.map((seed) => seed.locationKey),
            seedAgendaUids,
            selectedAgendas: [],
            eventResults: [],
            total: 0,
            targetCount: 0
          })
        };
        logOpenAgendaSummary(result.metadata, result.warnings);
        return result;
      }

      const eventResults = await fetchAgendaEvents({
        apiKey,
        baseUrl: env.OPENAGENDA_BASE_URL,
        fetchImpl,
        input,
        agendas: selectedAgendas,
        limit: Math.min(maxResults ?? input.limit, input.limit),
        warnings
      });

      const targets = eventResults.events.flatMap(({ agenda, event }) => {
        const normalized = normalizeBookingSource(openAgendaEventToRawSource(event, getFallbackCity(input), agenda));
        return normalized ? [normalized] : [];
      });
      const result = {
        sourceProvider: providerName,
        searchedQueries: [...discoveryQueries, ...eventResults.searchedQueries],
        targets,
        warnings: uniqueStrings(warnings),
        metadata: buildOpenAgendaMetadata({
          configuredAgendaUids,
          discoveryLocations,
          seedLocationKeys: matchedSeeds.map((seed) => seed.locationKey),
          seedAgendaUids,
          selectedAgendas,
          eventResults: eventResults.events,
          total: eventResults.total,
          targetCount: targets.length
        })
      };
      logOpenAgendaSummary(result.metadata, result.warnings);
      return result;
    }
  };
}

async function discoverAgendas({
  apiKey,
  baseUrl,
  fetchImpl,
  input,
  locations,
  seeds,
  searchedQueries,
  warnings
}: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl: FetchLike;
  input: BookingSearchInput;
  locations: string[];
  seeds: OpenAgendaLocationSeed[];
  searchedQueries: string[];
  warnings: string[];
}): Promise<SelectedOpenAgendaAgenda[]> {
  const candidates: Array<{ agenda: OpenAgendaAgenda; query: string; location: string | null }> = [];

  for (const query of buildAgendaDiscoveryQueries(input.genre, input.target ?? null, locations, seeds)) {
    searchedQueries.push(`agendas:${query.query}`);
    try {
      const response = await fetchOpenAgenda(buildOpenAgendaAgendaSearchUrl(baseUrl, query.query, 8), apiKey, fetchImpl);
      if (!response.ok) {
        warnings.push(`OpenAgenda agenda discovery failed with HTTP ${response.status} for "${query.query}".`);
        continue;
      }

      const body = (await response.json()) as OpenAgendaAgendaResponse;
      const agendas = body.agendas ?? body.data ?? [];
      for (const agenda of agendas) {
        candidates.push({ agenda, query: query.query, location: query.location });
      }
    } catch (error) {
      warnings.push(`OpenAgenda agenda discovery failed for "${query.query}": ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
  }

  return selectRelevantAgendas(candidates, input.genre, input.target ?? null, locations);
}

async function fetchAgendaEvents({
  apiKey,
  baseUrl,
  fetchImpl,
  input,
  agendas,
  limit,
  warnings
}: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl: FetchLike;
  input: BookingSearchInput;
  agendas: SelectedOpenAgendaAgenda[];
  limit: number;
  warnings: string[];
}): Promise<{ events: OpenAgendaEventResult[]; searchedQueries: string[]; total: number }> {
  const events: OpenAgendaEventResult[] = [];
  const searchedQueries: string[] = [];
  let total = 0;

  for (const agenda of agendas) {
    const query = buildOpenAgendaEventQuery(input.genre, agenda.matchedLocation ?? input.city, input.target ?? null);
    searchedQueries.push(`events:${agenda.uid}:${query}`);
    try {
      const response = await fetchOpenAgenda(buildOpenAgendaEventsUrl(baseUrl, agenda.uid, query, limit), apiKey, fetchImpl);
      if (!response.ok) {
        warnings.push(`OpenAgenda events request failed with HTTP ${response.status} for agenda ${agenda.uid}.`);
        continue;
      }

      const body = (await response.json()) as OpenAgendaEventResponse;
      const agendaEvents = body.events ?? body.data ?? [];
      total += body.total ?? agendaEvents.length;
      for (const event of agendaEvents) {
        events.push({ agenda, event });
      }
    } catch (error) {
      warnings.push(`OpenAgenda events request failed for agenda ${agenda.uid}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
  }

  return { events, searchedQueries, total };
}

function buildOpenAgendaMetadata({
  configuredAgendaUids,
  discoveryLocations,
  seedLocationKeys,
  seedAgendaUids,
  selectedAgendas,
  eventResults,
  total,
  targetCount
}: {
  configuredAgendaUids: string[];
  discoveryLocations: string[];
  seedLocationKeys: string[];
  seedAgendaUids: string[];
  selectedAgendas: SelectedOpenAgendaAgenda[];
  eventResults: OpenAgendaEventResult[];
  total: number;
  targetCount: number;
}): Record<string, unknown> {
  const discoveredAgendaUids = selectedAgendas
    .filter((agenda) => agenda.source === "discovery")
    .map((agenda) => agenda.uid);

  return {
    enabled: true,
    configuredAgendaUids,
    locationsSearched: discoveryLocations,
    discoveryLocations,
    seedLocationKeys,
    seedAgendaUids,
    seedAgendaUidsUsed: seedAgendaUids.length,
    discoveredAgendaUids,
    discoveredAgendaUidsCount: discoveredAgendaUids.length,
    selectedAgendaUids: selectedAgendas.map((agenda) => agenda.uid),
    selectedAgendas: selectedAgendas.map((agenda) => ({
      uid: agenda.uid,
      title: agenda.title,
      slug: agenda.slug,
      official: agenda.official,
      sourceUrl: agenda.sourceUrl,
      matchedQuery: agenda.matchedQuery,
      matchedLocation: agenda.matchedLocation,
      source: agenda.source
    })),
    eventSourceUrls: uniqueStrings(eventResults
      .map(({ event }) => event.canonicalUrl ?? event.url ?? event.registrationUrl ?? null)
      .filter((url): url is string => Boolean(url))),
    eventsFetched: eventResults.length,
    normalizedBookingTargets: targetCount,
    total
  };
}

function buildAgendaDiscoveryQueries(
  genre: string,
  target: string | null,
  locations: string[],
  seeds: OpenAgendaLocationSeed[]
): Array<{ query: string; location: string | null }> {
  const musicKeywords = uniqueStrings([
    ...buildGenreDiscoveryKeywords(genre),
    ...seeds.flatMap((seed) => seed.keywords),
    "concert",
    "musiques actuelles",
    "festival",
    "tremplin",
    "appel à candidature"
  ]);
  const locationQueries = locations.flatMap((location) => [
    { query: location, location },
    ...musicKeywords.slice(0, 8).map((keyword) => ({ query: `${location} ${keyword}`, location }))
  ]);
  const targetQueries = target
    ? musicKeywords.slice(0, 6).map((keyword) => ({ query: `${target} ${keyword}`, location: null }))
    : [];

  return uniqueByQuery([...locationQueries, ...targetQueries]).slice(0, 30);
}

function selectRelevantAgendas(
  candidates: Array<{ agenda: OpenAgendaAgenda; query: string; location: string | null }>,
  genre: string,
  target: string | null,
  locations: string[]
): SelectedOpenAgendaAgenda[] {
  const byUid = new Map<string, { agenda: OpenAgendaAgenda; query: string; location: string | null; score: number }>();

  for (const candidate of candidates) {
    const uid = candidate.agenda.uid === undefined ? null : String(candidate.agenda.uid).trim();
    if (!uid) {
      continue;
    }
    const score = scoreAgenda(candidate.agenda, candidate.location, genre, target, locations);
    if (score < 2) {
      continue;
    }
    const existing = byUid.get(uid);
    if (!existing || score > existing.score) {
      byUid.set(uid, { ...candidate, score });
    }
  }

  return [...byUid.entries()]
    .sort(([, left], [, right]) => right.score - left.score)
    .slice(0, 5)
    .map(([uid, candidate]) => ({
      uid,
      title: localizedText(candidate.agenda.title),
      slug: candidate.agenda.slug ?? null,
      official: typeof candidate.agenda.official === "boolean" ? candidate.agenda.official : null,
      sourceUrl: buildAgendaSourceUrl(uid, candidate.agenda.slug ?? null),
      matchedQuery: candidate.query,
      matchedLocation: candidate.location,
      source: "discovery"
    }));
}

function scoreAgenda(
  agenda: OpenAgendaAgenda,
  matchedLocation: string | null,
  genre: string,
  target: string | null,
  locations: string[]
): number {
  const text = normalizeSearchText([
    localizedText(agenda.title),
    localizedText(agenda.description),
    localizedText(agenda.summary),
    agenda.slug
  ].filter(Boolean).join(" "));
  let score = matchedLocation ? 3 : 0;

  for (const location of locations) {
    if (text.includes(normalizeSearchText(location))) {
      score += 2;
    }
  }
  for (const token of normalizeSearchText(genre).split(/\s+/).filter(Boolean)) {
    if (text.includes(token)) {
      score += 1;
    }
  }
  if (target && text.includes(normalizeSearchText(target))) {
    score += 1;
  }
  if (/\b(concert|musique|music|festival|scene|salle|spectacle|culture)\b/i.test(text)) {
    score += 2;
  }
  if (agenda.official) {
    score += 1;
  }

  return score;
}

function buildOpenAgendaLocations(input: BookingSearchInput): string[] {
  const explicitLocations = [
    input.city,
    ...extractTargetLocations(input.target ?? null)
  ].filter((value): value is string => Boolean(value?.trim()));
  const artistLocation = input.artistProfile?.city?.trim() || null;
  const directLocations = [
    ...explicitLocations,
    explicitLocations.length === 0 ? artistLocation : null
  ].filter((value): value is string => Boolean(value?.trim()));
  const nearby = artistLocation ? nearbyFrenchCities(artistLocation) : [];
  const frenchFallback = targetRequestsFrance(input.target ?? null)
    ? ["Paris", "Lyon", "Marseille", "Lille", "Nantes", "Bordeaux", "Toulouse", "Rennes", "Strasbourg", "Montpellier"]
    : [];

  return uniqueStrings([...directLocations, ...nearby, ...frenchFallback]).slice(0, 20);
}

function extractTargetLocations(target: string | null): string[] {
  if (!target || targetRequestsFrance(target)) {
    return [];
  }
  return target
    .split(/[,;/|]+|\bet\b|\band\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && !/^(france|french|français|francaise|française|national|nearby|local|region|région)$/i.test(part));
}

function targetRequestsFrance(target: string | null): boolean {
  return Boolean(target && /\b(france|french|français|francaise|française|national|hexagone|grandes villes françaises|grandes villes francaises)\b/i.test(target));
}

function nearbyFrenchCities(city: string): string[] {
  const nearbyByCity: Record<string, string[]> = {
    paris: ["Montreuil", "Pantin", "Saint-Denis", "Ivry-sur-Seine"],
    lyon: ["Villeurbanne"],
    marseille: ["Aix-en-Provence"],
    lille: ["Roubaix", "Tourcoing"],
    bordeaux: ["Mérignac", "Pessac", "Talence"],
    nantes: ["Rezé", "Saint-Herblain"],
    toulouse: ["Blagnac"],
    rennes: ["Cesson-Sévigné"],
    strasbourg: ["Schiltigheim"],
    montpellier: []
  };
  return nearbyByCity[normalizeSearchText(city)] ?? [];
}

function buildOpenAgendaEventQuery(genre: string, city: string, target: string | null): string {
  return [genre, city, target].filter(Boolean).join(" ");
}

function buildOpenAgendaEventsUrl(baseUrl: string | undefined, agendaUid: string, query: string, limit: number): string {
  const url = new URL(`${baseUrl ?? "https://api.openagenda.com"}/v2/agendas/${encodeURIComponent(agendaUid)}/events`);
  url.searchParams.set("search", query);
  url.searchParams.set("size", String(Math.max(1, Math.min(limit, 20))));
  return url.toString();
}

function buildOpenAgendaAgendaSearchUrl(baseUrl: string | undefined, query: string, limit: number): string {
  const url = new URL(`${baseUrl ?? "https://api.openagenda.com"}/v2/agendas`);
  url.searchParams.set("search", query);
  url.searchParams.set("size", String(Math.max(1, Math.min(limit, 20))));
  for (const field of ["uid", "title", "description", "summary", "slug", "official"]) {
    url.searchParams.append("includeFields[]", field);
  }
  return url.toString();
}

async function fetchOpenAgenda(endpoint: string, apiKey: string, fetchImpl: FetchLike): Promise<Response> {
  return fetchImpl(endpoint, {
    method: "GET",
    headers: {
      key: apiKey,
      Accept: "application/json"
    }
  });
}

function isOpenAgendaEnabled(env: OpenAgendaBookingSourceProviderEnv): boolean {
  return env.ENABLE_OPENAGENDA === "true" || env.ENABLE_OPENAGENDA_BOOKING === "true";
}

function findMatchingOpenAgendaSeeds(
  seeds: OpenAgendaLocationSeed[],
  locations: string[],
  target: string | null
): OpenAgendaLocationSeed[] {
  const locationText = normalizeSearchText([...locations, target ?? ""].join(" "));
  return seeds.filter((seed) => {
    const seedValues = [
      seed.locationKey,
      seed.city,
      seed.region ?? "",
      seed.country,
      ...seed.nearbyCities
    ].map(normalizeSearchText);
    return seedValues.some((value) => value && locationText.includes(value));
  });
}

function uniqueAgendas(agendas: SelectedOpenAgendaAgenda[]): SelectedOpenAgendaAgenda[] {
  const seen = new Set<string>();
  return agendas.filter((agenda) => {
    if (seen.has(agenda.uid)) {
      return false;
    }
    seen.add(agenda.uid);
    return true;
  });
}

function buildGenreDiscoveryKeywords(genre: string): string[] {
  const normalizedGenre = normalizeSearchText(genre);
  if (normalizedGenre.includes("pop punk")) {
    return ["pop punk", "punk rock", "emo", "rock", "concert", "musiques actuelles"];
  }
  if (normalizedGenre.includes("metal")) {
    return ["metal", "metalcore", "hardcore", "concert", "musiques actuelles"];
  }
  if (normalizedGenre.includes("indie rock") || normalizedGenre.includes("rock independant")) {
    return ["indie rock", "rock indépendant", "garage rock", "post-punk", "concert"];
  }
  if (normalizedGenre.includes("hip hop") || normalizedGenre.includes("rap")) {
    return ["hip hop", "rap", "trap", "concert"];
  }
  if (normalizedGenre.includes("electro") || normalizedGenre.includes("electronic") || normalizedGenre.includes("techno")) {
    return ["electro", "techno", "house", "dj set", "club"];
  }
  if (normalizedGenre.includes("chanson")) {
    return ["chanson française", "folk", "acoustique", "concert"];
  }
  return [genre, "concert", "musiques actuelles", "festival"];
}

function getFallbackCity(input: BookingSearchInput): string {
  return input.city.trim() || input.artistProfile?.city || "";
}

function logOpenAgendaSummary(metadata: Record<string, unknown>, warnings: string[]): void {
  const locations = Array.isArray(metadata.locationsSearched) ? metadata.locationsSearched.join(", ") : "";
  warnLog("booking", [
    "OpenAgenda:",
    `- locations searched: ${locations || "none"}`,
    `- seed agenda UIDs used: ${String(metadata.seedAgendaUidsUsed ?? 0)}`,
    `- discovered agenda UIDs: ${String(metadata.discoveredAgendaUidsCount ?? 0)}`,
    `- events fetched: ${String(metadata.eventsFetched ?? 0)}`,
    `- normalized booking targets: ${String(metadata.normalizedBookingTargets ?? 0)}`,
    `- warnings: ${warnings.length}`
  ].join("\n"));
}

function openAgendaEventToRawSource(event: OpenAgendaEvent, fallbackCity: string, agenda: SelectedOpenAgendaAgenda): RawBookingSource {
  const title = localizedText(event.title) ?? `OpenAgenda event ${event.uid ?? ""}`.trim();
  const description = [
    localizedText(event.description),
    localizedText(event.longDescription),
    localizedText(event.html),
    ...(event.keywords ?? []),
    ...(event.tags ?? []),
    agenda.title ? `Agenda: ${agenda.title}` : null,
    `Agenda UID: ${agenda.uid}`
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

function parseAgendaUids(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return uniqueStrings(value.split(/[,;\s]+/).map((uid) => uid.trim()));
}

function buildAgendaSourceUrl(uid: string, slug: string | null): string {
  return slug ? `https://openagenda.com/${slug}` : `https://openagenda.com/agendas/${uid}`;
}

function uniqueByQuery(values: Array<{ query: string; location: string | null }>): Array<{ query: string; location: string | null }> {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeSearchText(value.query);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
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
