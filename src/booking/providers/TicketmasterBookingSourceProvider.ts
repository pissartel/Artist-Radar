import { matchBookingGenres } from "../genreMatching.js";
import { compareArtistPopularity } from "../relevance.js";
import type { BookingSearchInput, BookingTarget, BookingTargetCategory, VenueArtistEvidence } from "../types.js";
import type { BookingSourceProvider, BookingSourceProviderResult } from "./BookingSourceProvider.js";
import type { SimilarArtist } from "../../schemas.js";
import { mapWithConcurrency } from "../../utils/concurrency.js";
import { toDateOnlyString } from "../../utils/dateOnly.js";
import { debugLog, warnLog } from "../../utils/logger.js";
import { normalizeKey } from "../../utils/venueNameNormalization.js";
import {
  TicketmasterClient,
  createTicketmasterDiagnostics,
  type TicketmasterAttractionApi
} from "../../providers/ticketmaster/TicketmasterClient.js";
import {
  mapGenreToTicketmasterClassifications,
  isGenericTicketmasterClassification
} from "../../providers/ticketmaster/genreMapping.js";
import { resolveAttraction } from "../../providers/ticketmaster/attractionResolution.js";
import {
  assessLineup,
  normalizeTicketmasterEvent,
  type TicketmasterConcert,
  type TicketmasterEventApi
} from "../../providers/ticketmaster/normalizeTicketmasterEvent.js";
import {
  computeTicketmasterOpportunityScore,
  dataConfidenceScoreFromCompleteness,
  genreScoreFromMatch,
  opportunitySignalScoreFromLineup,
  similarArtistScoreFromCompatibility,
  venueScoreFromEvidenceCount
} from "../../providers/ticketmaster/scoring.js";
import type { SimilarArtistTicketmasterEvents, TicketmasterSearchOutcome } from "../../providers/ticketmaster/types.js";
import { aggregateVenueEvidence, buildVenueEvidenceCountLookup, venueEvidenceKeyFor } from "../../modules/ticketmasterEvidence.js";
import { isEligibleConcertLeadTime } from "../concertLeadTime.js";
import { resolveVenueOfficialUrl } from "../venueUrl.js";
import {
  selectEligibleSimilarArtistsForBookingVenueDiscovery
} from "../similarArtistEligibility.js";
import { findCountryByPattern, normalizeCountryName } from "../targetCountry.js";

export interface TicketmasterBookingProviderEnv {
  ENABLE_TICKETMASTER_CONCERTS?: string;
  TICKETMASTER_API_KEY?: string;
  TICKETMASTER_COUNTRY_CODE?: string;
  TICKETMASTER_SEARCH_RADIUS_KM?: string;
  TICKETMASTER_EVENT_LIMIT?: string;
  TICKETMASTER_SIMILAR_ARTIST_LIMIT?: string;
  TICKETMASTER_LOOKAHEAD_MONTHS?: string;
  TICKETMASTER_PAST_LOOKBACK_MONTHS?: string;
}

export interface TicketmasterBookingProviderOptions {
  env?: TicketmasterBookingProviderEnv;
  fetchImpl?: typeof fetch;
  client?: TicketmasterClient;
  now?: Date;
}

export const DEFAULT_RADIUS_KM = 100;
export const DEFAULT_EVENT_LIMIT = 50;
export const DEFAULT_SIMILAR_ARTIST_LIMIT = 5;
export const DEFAULT_LOOKAHEAD_MONTHS = 12;
export const DEFAULT_PAST_LOOKBACK_MONTHS = 18;
export const DEFAULT_TICKETMASTER_CONCURRENCY = 2;

export function isTicketmasterEnabled(env: TicketmasterBookingProviderEnv = process.env): boolean {
  return env.ENABLE_TICKETMASTER_CONCERTS === "true" && Boolean(env.TICKETMASTER_API_KEY);
}

export function getTicketmasterRadiusKm(env: TicketmasterBookingProviderEnv = process.env): number {
  return parsePositiveInt(env.TICKETMASTER_SEARCH_RADIUS_KM, DEFAULT_RADIUS_KM);
}

export function getTicketmasterEventLimit(env: TicketmasterBookingProviderEnv = process.env): number {
  return parsePositiveInt(env.TICKETMASTER_EVENT_LIMIT, DEFAULT_EVENT_LIMIT);
}

export function getTicketmasterSimilarArtistLimit(env: TicketmasterBookingProviderEnv = process.env): number {
  return parsePositiveInt(env.TICKETMASTER_SIMILAR_ARTIST_LIMIT, DEFAULT_SIMILAR_ARTIST_LIMIT);
}

export function getTicketmasterLookaheadMonths(env: TicketmasterBookingProviderEnv = process.env): number {
  return parsePositiveInt(env.TICKETMASTER_LOOKAHEAD_MONTHS, DEFAULT_LOOKAHEAD_MONTHS);
}

export function getTicketmasterPastLookbackMonths(env: TicketmasterBookingProviderEnv = process.env): number {
  return parsePositiveInt(env.TICKETMASTER_PAST_LOOKBACK_MONTHS, DEFAULT_PAST_LOOKBACK_MONTHS);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Small, non-exhaustive country-name -> ISO 3166-1 alpha-2 map so the
// countryCode filter can be resolved from the artist's own profile country
// without hardcoding a single country as the only supported market
// (issue #189: "the same implementation must work for Bordeaux, Lyon,
// Lille, Nantes, Toulouse or cities outside France"). Explicit
// TICKETMASTER_COUNTRY_CODE always wins; unresolvable countries simply
// omit the filter rather than guessing.
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  france: "FR",
  "united states": "US",
  usa: "US",
  "united kingdom": "GB",
  uk: "GB",
  germany: "DE",
  spain: "ES",
  italy: "IT",
  belgium: "BE",
  switzerland: "CH",
  netherlands: "NL",
  canada: "CA",
  australia: "AU"
};

function resolveCountryCode(
  env: TicketmasterBookingProviderEnv,
  profileCountry: string | null | undefined,
  targetRegion?: string | null
): string | undefined {
  if (env.TICKETMASTER_COUNTRY_CODE) {
    return env.TICKETMASTER_COUNTRY_CODE.trim().toUpperCase();
  }
  // profileCollector.ts currently always sets artistProfile.country to null
  // (no geocoding step exists yet), so --target is the only practical
  // country signal available today; kept as a fallback rather than the
  // primary source in case profile country detection is added later.
  for (const candidate of [profileCountry, targetRegion]) {
    const normalized = findCountryByPattern(candidate) ?? normalizeCountryName(candidate);
    const code = normalized ? COUNTRY_NAME_TO_CODE[normalized] : undefined;
    if (code) {
      return code;
    }
  }
  return undefined;
}

/**
 * Selects the top N similar artists by compatibility score
 * (SimilarArtist.totalRelevance), deterministic tiebreak by name — never a
 * random subset. Mirrors the equivalent helper used for other
 * concert-history providers in this codebase.
 */
export function selectTopCompatibleSimilarArtists(artists: SimilarArtist[], limit: number): SimilarArtist[] {
  return [...artists]
    .sort((left, right) => {
      if (right.totalRelevance !== left.totalRelevance) {
        return right.totalRelevance - left.totalRelevance;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}

export function buildTicketmasterBookingSourceProvider(
  options: TicketmasterBookingProviderOptions = {}
): BookingSourceProvider {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const providerName = "ticketmaster";

  return {
    providerName,
    async search({ input }): Promise<BookingSourceProviderResult> {
      if (!isTicketmasterEnabled(env)) {
        const reason = !env.TICKETMASTER_API_KEY ? "missing_api_key" : "disabled";
        debugLog("ticketmaster", `Ticketmaster skipped: ${reason === "missing_api_key" ? "TICKETMASTER_API_KEY is missing" : "ENABLE_TICKETMASTER_CONCERTS is not true"}.`);
        return {
          targets: [],
          sourceProvider: providerName,
          searchedQueries: [],
          warnings: [],
          metadata: { enabled: false, reason }
        };
      }

      debugLog("ticketmaster", "Integration enabled");
      const client = options.client ?? new TicketmasterClient({
        apiKey: env.TICKETMASTER_API_KEY!,
        fetchImpl,
        diagnostics: createTicketmasterDiagnostics(true)
      });

      const now = options.now ?? new Date();
      const outcome = await runTicketmasterSearches(client, input, env, now);
      const targets = buildBookingTargets(input, outcome, now);

      logTopOpportunities(targets);
      const summary = `${targets.length} relevant events and ${countUniqueVenues(targets)} compatible venues found`;
      warnLog("ticketmaster", summary);

      return {
        targets,
        sourceProvider: providerName,
        searchedQueries: [],
        warnings: [],
        metadata: {
          enabled: true,
          diagnostics: outcome.diagnostics,
          genreLocationEventCount: outcome.genreLocationEvents.length,
          rawEventCount: outcome.genreLocationEvents.length + outcome.similarArtistEvents.flatMap((entry) => [...entry.upcomingEvents, ...entry.pastEvents]).length,
          venueOpportunitiesCreated: targets.filter((target) => target.category === "venue").length,
          eventOpportunitiesCreated: targets.filter((target) => target.category === "event").length,
          similarArtistsProcessed: outcome.similarArtistEvents.length,
          similarArtistEligibilityDiagnostics: outcome.similarArtistEligibilityDiagnostics ?? [],
          // Raw outcome retained here (the existing metadata bag convention
          // for provider-specific structured data) so the pipeline can build
          // venue/scene evidence from the same data already fetched here,
          // without a second round of Ticketmaster API calls.
          searchOutcome: outcome
        }
      };
    }
  };
}

async function runTicketmasterSearches(
  client: TicketmasterClient,
  input: BookingSearchInput,
  env: TicketmasterBookingProviderEnv,
  now: Date = new Date()
): Promise<TicketmasterSearchOutcome> {
  const city = input.city?.trim() || input.artistProfile?.city?.trim() || null;
  const countryCode = resolveCountryCode(env, input.artistProfile?.country, input.target);
  const radiusKm = getTicketmasterRadiusKm(env);
  const targetGenres = [input.genre, ...(input.artistProfile?.genres ?? [])];

  debugLog("ticketmaster", `Search location: ${city ?? "unknown"}${countryCode ? `, ${countryCode}` : ""}`);
  debugLog("ticketmaster", `Radius: ${radiusKm} km`);
  debugLog("ticketmaster", `Target genres: ${targetGenres.join(", ")}`);

  // Only the single closest Ticketmaster classification for the genre given
  // as input is queried — not the broader fallback entries in
  // ticketmasterGenreMappings (e.g. "pop punk" maps to ["Punk", "Alternative
  // Rock", "Rock"], but querying "Rock"/"Alternative Rock" too pulls in
  // generic Rock/Pop shows unrelated to the artist's actual genre, diluting
  // relevance). Genre compatibility outranks result volume (CLAUDE.md).
  const primaryClassification = mapGenreToTicketmasterClassifications(input.genre)[0];
  const classifications = primaryClassification ? [primaryClassification] : [];
  debugLog("ticketmaster", `Ticketmaster classifications: ${classifications.length > 0 ? classifications.join(", ") : "none (falling back to keyword search)"}`);

  if (city) {
    debugLog(
      "ticketmaster",
      `[genre-search] Calling Ticketmaster for genre(s) "${targetGenres.join(", ")}" -> classifications [${classifications.join(", ") || "none"}] at location "${city}"${countryCode ? `, ${countryCode}` : ""} (radius ${radiusKm}km)`
    );
  } else {
    debugLog("ticketmaster", "[genre-search] Skipped: no location (city) available for this artist");
  }

  const genreLocationEvents = city
    ? await searchGenreLocationEvents(client, { city, countryCode, radiusKm, classifications, targetGenres, env }, now)
    : [];

  const similarArtistSelection = selectEligibleSimilarArtistsForBookingVenueDiscovery(
    input.similarArtists ?? [],
    getTicketmasterSimilarArtistLimit(env)
  );
  const similarArtists = similarArtistSelection.artists;
  debugLog("ticketmaster", `[similar-artists] Found ${input.similarArtists?.length ?? 0} similar artists`);
  debugLog("ticketmaster", `[similar-artists] Selected top ${similarArtists.length}`);
  similarArtists.forEach((artist, index) => {
    debugLog("ticketmaster", `[similar-artists] ${index + 1}. ${artist.name} — compatibility: ${(artist.totalRelevance / 100).toFixed(2)}`);
  });

  const similarArtistEvents = await mapWithConcurrency(
    similarArtists,
    DEFAULT_TICKETMASTER_CONCURRENCY,
    (artist) => resolveSimilarArtistEvents(client, artist, targetGenres, env, countryCode, now)
  );

  return {
    genreLocationEvents,
    similarArtistEvents,
    diagnostics: client.diagnostics,
    similarArtistEligibilityDiagnostics: similarArtistSelection.diagnostics
  };
}

async function searchGenreLocationEvents(
  client: TicketmasterClient,
  params: {
    city: string;
    countryCode: string | undefined;
    radiusKm: number;
    classifications: string[];
    targetGenres: string[];
    env: TicketmasterBookingProviderEnv;
  },
  now: Date = new Date()
): Promise<TicketmasterConcert[]> {
  debugLog("ticketmaster", "[genre-search] Searching future events");
  const lookaheadMonths = getTicketmasterLookaheadMonths(params.env);
  const eventLimit = getTicketmasterEventLimit(params.env);
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + lookaheadMonths);

  const baseParams: Record<string, string> = {
    segmentName: "Music",
    city: params.city,
    radius: String(params.radiusKm),
    unit: "km",
    startDateTime: `${toDateOnlyString(now)}T00:00:00Z`,
    endDateTime: `${toDateOnlyString(endDate)}T23:59:59Z`,
    size: String(Math.min(eventLimit, 50)),
    sort: "date,asc",
    // Ticketmaster defaults to an English-only locale, which silently
    // excludes most non-US/UK market listings (e.g. Paris returns ~0
    // events across every classification without this; with it, hundreds).
    locale: "*"
  };
  if (params.countryCode) {
    baseParams.countryCode = params.countryCode;
  }

  // Several complementary, specific queries rather than one large generic
  // one (issue #189) — each classification is its own query.
  const queries = params.classifications.length > 0
    ? params.classifications.map((classification) => ({ ...baseParams, classificationName: classification }))
    : [baseParams];

  const rawEvents: TicketmasterEventApi[] = [];
  for (const query of queries) {
    const classificationName = "classificationName" in query ? query.classificationName : undefined;
    debugLog("ticketmaster", `[genre-search] Query: classificationName=${classificationName ?? "(none)"} city=${baseParams.city} radius=${baseParams.radius}${baseParams.countryCode ? ` countryCode=${baseParams.countryCode}` : ""} ${baseParams.startDateTime}..${baseParams.endDateTime}`);
    const events = await client.searchEvents(query, "genre");
    debugLog("ticketmaster", `[genre-search]   -> ${events.length} raw event(s)`);
    rawEvents.push(...events);
  }
  debugLog("ticketmaster", `[genre-search] Raw events: ${rawEvents.length}`);
  logRawEventDetails("genre-search", rawEvents, now);

  const normalized = rawEvents.flatMap((event) => {
    const concert = normalizeTicketmasterEvent(event, now);
    return concert ? [concert] : [];
  });

  const relevant: TicketmasterConcert[] = [];
  for (const concert of normalized) {
    const genreMatch = matchEventGenres(concert, params.targetGenres);
    const kept = genreMatch.level === "exact" || genreMatch.level === "related" || genreMatch.level === "generic";
    debugLog(
      "ticketmaster",
      `[genre-search] ${kept ? "KEEP" : "DROP"} "${concert.name}" — ${concert.date.localDate} — ${concert.venue?.name ?? "unknown venue"}, ${concert.venue?.city ?? "unknown city"} — genre match: ${genreMatch.level} (event genres: ${uniqueStrings((concert.classifications ?? []).flatMap((c) => [c.genre, c.subGenre]).filter((value): value is string => Boolean(value))).join(", ") || "none"})`
    );
    if (kept) {
      relevant.push(concert);
    }
  }
  debugLog("ticketmaster", `[genre-search] Relevant events after scoring: ${relevant.length}`);

  return dedupeConcerts(relevant);
}

/** Logs every raw event's name/date/venue/city/url so real API output can be inspected manually, not just aggregate counts. */
function logRawEventDetails(label: string, events: TicketmasterEventApi[], now: Date): void {
  for (const event of events) {
    const concert = normalizeTicketmasterEvent(event, now);
    if (!concert) {
      debugLog("ticketmaster", `[${label}]   - (dropped: missing id/name/date) raw name=${event.name ?? "?"} id=${event.id ?? "?"}`);
      continue;
    }
    debugLog(
      "ticketmaster",
      `[${label}]   - ${concert.date.localDate} | ${concert.name} | ${concert.venue?.name ?? "unknown venue"}, ${concert.venue?.city ?? "unknown city"} | status=${concert.status} | ${concert.url ?? "no url"}`
    );
  }
}

async function resolveSimilarArtistEvents(
  client: TicketmasterClient,
  artist: SimilarArtist,
  targetGenres: string[],
  env: TicketmasterBookingProviderEnv,
  countryCode: string | undefined,
  now: Date = new Date()
): Promise<SimilarArtistTicketmasterEvents> {
  debugLog("ticketmaster", `[${artist.name}][attraction] Searching attraction`);
  const candidates = await client.searchAttractions(artist.name);
  debugLog("ticketmaster", `[${artist.name}][attraction] ${candidates.length} raw candidate(s):`);
  for (const candidate of candidates) {
    const genres = (candidate.classifications ?? [])
      .flatMap((c) => [c.genre?.name, c.subGenre?.name])
      .filter((value): value is string => Boolean(value));
    debugLog("ticketmaster", `[${artist.name}][attraction]   - "${candidate.name ?? "?"}" (id=${candidate.id ?? "?"}) genres: ${genres.join(", ") || "none"}`);
  }
  const resolution = resolveAttraction(artist.name, candidates.map(toAttractionCandidate), { targetGenres: artist.genres });

  if (resolution.status !== "resolved" || !resolution.attractionId) {
    debugLog("ticketmaster", `[${artist.name}][attraction] ${resolution.status === "ambiguous" ? "Ambiguous result — skipped" : "Not found — skipped"}`);
    return { artist, attractionResolution: resolution, pastEvents: [], upcomingEvents: [] };
  }
  debugLog("ticketmaster", `[${artist.name}][attraction] Resolved to ${resolution.attractionId} — confidence: ${resolution.confidence.toFixed(2)}`);

  const lookaheadMonths = getTicketmasterLookaheadMonths(env);
  const pastLookbackMonths = getTicketmasterPastLookbackMonths(env);
  const upcomingEnd = new Date(now);
  upcomingEnd.setMonth(upcomingEnd.getMonth() + lookaheadMonths);
  const pastStart = new Date(now);
  pastStart.setMonth(pastStart.getMonth() - pastLookbackMonths);

  // Scoped to the same market as the genre+location search — a similar
  // artist's shows abroad aren't a local booking opportunity for this
  // artist, so they're not useful evidence here.
  debugLog(
    "ticketmaster",
    `[${artist.name}][events] Querying events${countryCode ? ` restricted to countryCode=${countryCode}` : " (no country restriction — location unknown)"}`
  );

  const [upcomingRaw, pastRaw] = await Promise.all([
    client.searchEvents({
      attractionId: resolution.attractionId,
      startDateTime: `${toDateOnlyString(now)}T00:00:00Z`,
      endDateTime: `${toDateOnlyString(upcomingEnd)}T23:59:59Z`,
      size: "20",
      sort: "date,asc",
      locale: "*",
      ...(countryCode ? { countryCode } : {})
    }, "artist"),
    // Best-effort only: Ticketmaster's past-event coverage is partial and
    // zero results here never means the artist has never played anywhere
    // (issue #189) — it's opportunistic evidence, not history reconstruction.
    client.searchEvents({
      attractionId: resolution.attractionId,
      startDateTime: `${toDateOnlyString(pastStart)}T00:00:00Z`,
      endDateTime: `${toDateOnlyString(now)}T23:59:59Z`,
      size: "20",
      sort: "date,desc",
      locale: "*",
      ...(countryCode ? { countryCode } : {})
    }, "artist")
  ]);

  // Bucket by each concert's own classified status rather than by which of
  // the two queries returned it: the upcoming/past date windows are
  // requests, not guarantees, so a boundary or data-quality mismatch must
  // not mislabel an event.
  const allEvents = dedupeConcerts([...upcomingRaw, ...pastRaw].flatMap((event) => {
    const concert = normalizeTicketmasterEvent(event, now);
    return concert ? [concert] : [];
  }));
  const upcomingEvents = allEvents.filter((concert) => concert.status === "upcoming");
  const pastEvents = allEvents.filter((concert) => concert.status === "past");

  debugLog("ticketmaster", `[${artist.name}][events] Past: ${pastEvents.length} | Upcoming: ${upcomingEvents.length}`);
  for (const concert of [...upcomingEvents, ...pastEvents]) {
    debugLog(
      "ticketmaster",
      `[${artist.name}][events]   - [${concert.status}] ${concert.date.localDate} | ${concert.name} | ${concert.venue?.name ?? "unknown venue"}, ${concert.venue?.city ?? "unknown city"} | ${concert.url ?? "no url"}`
    );
  }
  return { artist, attractionResolution: resolution, pastEvents, upcomingEvents };
}

function toAttractionCandidate(attraction: TicketmasterAttractionApi) {
  const classifications = attraction.classifications ?? [];
  const primary = classifications[0];
  return {
    id: attraction.id ?? "",
    name: attraction.name ?? "",
    classificationSegment: primary?.segment?.name ?? null,
    genres: classifications.flatMap((classification) =>
      [classification.genre?.name, classification.subGenre?.name].filter((value): value is string => Boolean(value))
    )
  };
}

function matchEventGenres(concert: TicketmasterConcert, targetGenres: string[]) {
  const eventGenres = (concert.classifications ?? []).flatMap((classification) =>
    [classification.genre, classification.subGenre].filter((value): value is string => Boolean(value))
  );
  return matchBookingGenres(targetGenres, eventGenres);
}

function buildBookingTargets(input: BookingSearchInput, outcome: TicketmasterSearchOutcome, now: Date): BookingTarget[] {
  const targets: BookingTarget[] = [];
  const seenEventIds = new Set<string>();
  const venueEvidence = aggregateVenueEvidence(outcome.similarArtistEvents);
  const venueEvidenceCounts = buildVenueEvidenceCountLookup(venueEvidence);
  const venueTargets = new Map<string, BookingTarget>();

  const addVenueTarget = (concert: TicketmasterConcert, similarArtist: SimilarArtist | null) => {
    const venueTarget = toVenueBookingTarget(input, concert, similarArtist, venueEvidenceCounts, now);
    if (!venueTarget) return;
    const key = ticketmasterVenueDedupeKey(concert);
    const existing = venueTargets.get(key);
    venueTargets.set(key, existing ? mergeTicketmasterVenueTargets(existing, venueTarget) : venueTarget);
  };

  for (const concert of outcome.genreLocationEvents) {
    if (seenEventIds.has(concert.eventId)) continue;
    seenEventIds.add(concert.eventId);
    addVenueTarget(concert, null);
    if (concert.status !== "upcoming" || !isEligibleConcertLeadTime(concert.date.localDate, now)) continue;
    targets.push(toBookingTarget(input, concert, null, true, venueEvidenceCounts));
  }

  for (const { artist, pastEvents, upcomingEvents } of outcome.similarArtistEvents) {
    for (const concert of [...upcomingEvents, ...pastEvents]) {
      if (seenEventIds.has(concert.eventId)) continue;
      seenEventIds.add(concert.eventId);
      addVenueTarget(concert, artist);
      if (concert.status !== "upcoming" || !isEligibleConcertLeadTime(concert.date.localDate, now)) continue;
      // Similar-artist events aren't filtered by the target's requested
      // location (a similar artist's show can be anywhere), so location
      // match is unknown here rather than assumed true.
      targets.push(toBookingTarget(input, concert, artist, false, venueEvidenceCounts));
    }
  }

  targets.push(...venueTargets.values());

  debugLog("ticketmaster", `[deduplication] Raw opportunities: ${outcome.genreLocationEvents.length + outcome.similarArtistEvents.flatMap((entry) => [...entry.pastEvents, ...entry.upcomingEvents]).length}`);
  debugLog("ticketmaster", `[deduplication] Final opportunities: ${targets.length}`);

  return targets;
}

function toVenueBookingTarget(
  input: BookingSearchInput,
  concert: TicketmasterConcert,
  similarArtist: SimilarArtist | null,
  venueEvidenceCounts: Map<string, number>,
  now: Date
): BookingTarget | null {
  const venue = concert.venue;
  if (!venue?.name) return null;

  const genreMatch = matchEventGenres(concert, [input.genre, ...(input.artistProfile?.genres ?? [])]);
  const eventGenres = (concert.classifications ?? []).flatMap((classification) =>
    [classification.genre, classification.subGenre].filter((value): value is string => Boolean(value))
  );
  const venueKey = venueEvidenceKeyFor(concert);
  const matchingArtistCount = venueKey ? venueEvidenceCounts.get(venueKey) ?? (similarArtist ? 1 : 0) : 0;
  const sourceUrl = resolveVenueOfficialUrl([{ url: venue.url, verified: true }]);
  const venueOpportunityId = buildVenueOpportunityId(venue.name, venue.city ?? null, venue.country ?? null);
  const compatibilityScore = similarArtist?.totalRelevance ?? null;
  const collectedAt = now.toISOString();
  const venueArtistEvidence: VenueArtistEvidence[] = similarArtist && concert.url
    ? [{
        venueId: venueOpportunityId,
        similarArtistId: normalizeKey(similarArtist.name),
        similarArtistName: similarArtist.name,
        eventName: concert.name,
        eventDate: concert.date.localDate,
        sourceUrl: concert.url,
        collectedAt,
        sourceProvider: "ticketmaster",
        confidence: Math.min(1, similarArtist.totalRelevance / 100)
      }]
    : [];

  const evidence = uniqueStrings([
    similarArtist
      ? `Similar artist ${similarArtist.name} ${concert.status === "past" ? "played" : "is scheduled to play"} ${venue.name} on ${concert.date.localDate}.`
      : `Ticketmaster event ${concert.name} is listed at ${venue.name} on ${concert.date.localDate}.`,
    concert.url ? `Event source: ${concert.url}` : null,
    sourceUrl ? `Venue page: ${sourceUrl}` : null,
    compatibilityScore !== null ? `Similar artist compatibility: ${compatibilityScore}/100.` : null
  ].filter((value): value is string => Boolean(value)));

  return {
    name: venue.name,
    category: "venue",
    city: venue.city ?? null,
    country: venue.country ?? null,
    description: `${venue.name} is a venue found from Ticketmaster concert data.`,
    sourceUrl,
    sourceType: sourceUrl ? "venue_official_programming_page" : "similar_artist_live_history",
    sourceProvider: "ticketmaster",
    genres: uniqueStrings([...eventGenres, ...(similarArtist?.genres ?? []), ...genreMatch.matchedGenres]),
    estimatedCapacity: null,
    estimatedArtistTier: null,
    pastProgramming: uniqueStrings([concert.name, ...concert.attractions.map((attraction) => attraction.name)]),
    venueName: venue.name,
    venueOpportunityId,
    address: venue.address ?? null,
    postalCode: venue.postalCode ?? null,
    latitude: venue.latitude ?? null,
    longitude: venue.longitude ?? null,
    providerVenueId: venue.ticketmasterId ?? null,
    lineup: concert.attractions.map((attraction) => attraction.name),
    programmingEvidence: uniqueProgrammingEvidence([
      ...concert.attractions.map((attraction) => ({
        artistName: attraction.name,
        artistNames: concert.attractions.map((entry) => entry.name),
        eventName: concert.name,
        eventDate: concert.date.localDate,
        sourceUrl: concert.url ?? null,
        genres: eventGenres
      })),
      ...(similarArtist ? [{
        artistName: similarArtist.name,
        artistNames: concert.attractions.map((entry) => entry.name),
        eventName: concert.name,
        eventDate: concert.date.localDate,
        sourceUrl: concert.url ?? null,
        genres: similarArtist.genres
      }] : [])
    ]),
    imageUrl: null,
    ticketUrl: null,
    eventDate: null,
    isFutureEvent: null,
    isPastEvent: null,
    dateConfidence: "unclear",
    opportunityKind: "actionable",
    derivedFromSimilarArtist: similarArtist
      ? {
          name: similarArtist.name,
          popularityComparison: compareArtistPopularity(input, similarArtist).comparison,
          matchedGenres: genreMatch.matchedGenres,
          sourceUrl: concert.url ?? null
        }
      : null,
    venueArtistEvidence,
    contacts: [],
    confidence: computeTicketmasterVenueConfidence({
      hasVenueId: Boolean(venue.ticketmasterId),
      hasLocation: Boolean(venue.city || venue.country),
      hasSourceUrl: Boolean(sourceUrl),
      hasSimilarArtistEvidence: Boolean(similarArtist),
      hasContact: false,
      hasCapacity: false,
      matchingArtistCount
    }),
    evidence
  };
}

function toBookingTarget(
  input: BookingSearchInput,
  concert: TicketmasterConcert,
  similarArtist: SimilarArtist | null,
  matchedByRequestedLocation: boolean,
  venueEvidenceCounts: Map<string, number>
): BookingTarget {
  const lineup = assessLineup(concert);
  const category = classifyCategory(concert);
  const genreMatch = matchEventGenres(concert, [input.genre, ...(input.artistProfile?.genres ?? [])]);
  const isGeneric = (concert.classifications ?? []).some((classification) => classification.genre && isGenericTicketmasterClassification(classification.genre));
  const popularity = similarArtist ? compareArtistPopularity(input, similarArtist) : null;
  const venueKey = venueEvidenceKeyFor(concert);
  const matchingArtistCount = venueKey ? venueEvidenceCounts.get(venueKey) ?? 0 : 0;

  const scoreComponents = {
    genreScore: genreScoreFromMatch(genreMatch.level, isGeneric),
    // Full location score when the event was already filtered by the
    // requested city/radius; neutral/unknown when it wasn't (a similar
    // artist's event can be anywhere, not necessarily near the target).
    locationScore: matchedByRequestedLocation ? 1 : 0.5,
    similarArtistScore: similarArtistScoreFromCompatibility(similarArtist?.totalRelevance),
    venueScore: venueScoreFromEvidenceCount(matchingArtistCount),
    artistSizeScore: popularity ? popularity.score / 100 : 0.5,
    opportunitySignalScore: opportunitySignalScoreFromLineup(lineup.supportSlotSignal),
    dataConfidenceScore: dataConfidenceScoreFromCompleteness(Boolean(concert.venue), Boolean(concert.classifications?.length), Boolean(concert.url))
  };
  const confidence = computeTicketmasterOpportunityScore(scoreComponents);

  const evidence = uniqueStrings([
    similarArtist ? `Similar artist ${similarArtist.name} is linked to this event (compatibility ${similarArtist.totalRelevance}/100).` : `Found via genre/location search.`,
    lineup.explanation,
    concert.eventType === "festival" ? "Detected as a festival/multi-day event, not a standalone venue support-slot opportunity." : null,
    concert.status === "past" ? "This is a past event — retained only as opportunistic evidence, not confirmation of current booking activity." : null
  ].filter((value): value is string => Boolean(value)));

  return {
    name: concert.name,
    category,
    city: concert.venue?.city ?? null,
    country: concert.venue?.country ?? null,
    description: concert.name,
    sourceUrl: concert.url ?? null,
    sourceType: "event_page",
    sourceProvider: "ticketmaster",
    genres: (concert.classifications ?? []).flatMap((classification) => [classification.genre, classification.subGenre].filter((value): value is string => Boolean(value))),
    venueName: concert.venue?.name ?? null,
    venueOpportunityId: concert.venue?.name ? buildVenueOpportunityId(concert.venue.name, concert.venue.city ?? null, concert.venue.country ?? null) : null,
    address: concert.venue?.address ?? null,
    postalCode: concert.venue?.postalCode ?? null,
    latitude: concert.venue?.latitude ?? null,
    longitude: concert.venue?.longitude ?? null,
    providerVenueId: concert.venue?.ticketmasterId ?? null,
    lineup: concert.attractions.map((attraction) => attraction.name),
    imageUrl: concert.images?.[0]?.url ?? null,
    ticketUrl: concert.url ?? null,
    eventDate: concert.date.localDate,
    isFutureEvent: concert.status === "upcoming",
    isPastEvent: concert.status === "past",
    dateConfidence: "verified",
    opportunityKind: concert.status === "upcoming" ? "actionable" : "historical_signal",
    derivedFromSimilarArtist: similarArtist
      ? {
          name: similarArtist.name,
          popularityComparison: popularity?.comparison ?? "unknown",
          matchedGenres: genreMatch.matchedGenres,
          sourceUrl: concert.url ?? null
        }
      : null,
    contacts: [],
    confidence,
    evidence
  };
}

function mergeTicketmasterVenueTargets(existing: BookingTarget, incoming: BookingTarget): BookingTarget {
  return {
    ...existing,
    sourceUrl: existing.sourceUrl ?? incoming.sourceUrl,
    sourceType: existing.sourceUrl ? existing.sourceType : incoming.sourceType,
    genres: uniqueStrings([...existing.genres, ...incoming.genres]),
    pastProgramming: uniqueStrings([...(existing.pastProgramming ?? []), ...(incoming.pastProgramming ?? [])]),
    address: existing.address ?? incoming.address,
    postalCode: existing.postalCode ?? incoming.postalCode,
    latitude: existing.latitude ?? incoming.latitude,
    longitude: existing.longitude ?? incoming.longitude,
    providerVenueId: existing.providerVenueId ?? incoming.providerVenueId,
    lineup: uniqueStrings([...(existing.lineup ?? []), ...(incoming.lineup ?? [])]),
    programmingEvidence: mergeProgrammingEvidence(existing.programmingEvidence, incoming.programmingEvidence),
    derivedFromSimilarArtist: existing.derivedFromSimilarArtist ?? incoming.derivedFromSimilarArtist,
    venueArtistEvidence: mergeVenueArtistEvidence(existing.venueArtistEvidence, incoming.venueArtistEvidence),
    confidence: Math.min(0.92, Math.max(existing.confidence, incoming.confidence) + 0.03),
    evidence: uniqueStrings([...existing.evidence, ...incoming.evidence])
  };
}

function mergeProgrammingEvidence(
  left?: BookingTarget["programmingEvidence"],
  right?: BookingTarget["programmingEvidence"]
): BookingTarget["programmingEvidence"] {
  return uniqueProgrammingEvidence([...(left ?? []), ...(right ?? [])]);
}

function uniqueProgrammingEvidence(values: NonNullable<BookingTarget["programmingEvidence"]>): NonNullable<BookingTarget["programmingEvidence"]> {
  const byArtist = new Map<string, NonNullable<BookingTarget["programmingEvidence"]>[number]>();
  for (const value of values) {
    const key = normalizeKey(value.artistName);
    const existing = byArtist.get(key);
    byArtist.set(key, {
      artistName: existing?.artistName ?? value.artistName,
      artistNames: uniqueStrings([...(existing?.artistNames ?? []), ...(value.artistNames ?? [])]),
      eventName: existing?.eventName ?? value.eventName ?? null,
      eventDate: existing?.eventDate ?? value.eventDate ?? null,
      sourceUrl: existing?.sourceUrl ?? value.sourceUrl ?? null,
      genres: uniqueStrings([...(existing?.genres ?? []), ...value.genres])
    });
  }
  return [...byArtist.values()];
}

function mergeVenueArtistEvidence(left?: VenueArtistEvidence[], right?: VenueArtistEvidence[]): VenueArtistEvidence[] {
  const seen = new Set<string>();
  const combined: VenueArtistEvidence[] = [];
  for (const item of [...(left ?? []), ...(right ?? [])]) {
    const key = `${item.similarArtistId}:${item.sourceUrl}:${item.eventDate ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(item);
  }
  return combined;
}

function ticketmasterVenueDedupeKey(concert: TicketmasterConcert): string {
  const venue = concert.venue;
  if (venue?.ticketmasterId) return `ticketmaster:${normalizeKey(venue.ticketmasterId)}`;
  const venueUrl = venue?.url ? normalizeUrl(venue.url) : null;
  if (venueUrl) return `url:${venueUrl}`;
  return `identity:${normalizeKey(venue?.name ?? "")}|${normalizeKey(venue?.city ?? "")}|${normalizeKey(venue?.country ?? "")}`;
}

function normalizeUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return null;
  }
}

function buildVenueOpportunityId(name: string, city: string | null, country: string | null): string {
  const slug = [name, city, country]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("-")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return `venue-${slug || "unknown"}`;
}

function computeTicketmasterVenueConfidence(details: {
  hasVenueId: boolean;
  hasLocation: boolean;
  hasSourceUrl: boolean;
  hasSimilarArtistEvidence: boolean;
  hasContact: boolean;
  hasCapacity: boolean;
  matchingArtistCount: number;
}): number {
  const score =
    0.2 +
    (details.hasVenueId ? 0.18 : 0) +
    (details.hasLocation ? 0.16 : 0) +
    (details.hasSourceUrl ? 0.18 : -0.08) +
    (details.hasSimilarArtistEvidence ? 0.12 : 0.04) +
    (details.hasContact ? 0.08 : 0) +
    (details.hasCapacity ? 0.06 : 0) +
    Math.min(0.1, details.matchingArtistCount * 0.03);
  return Math.max(0.25, Math.min(0.88, score));
}

function classifyCategory(concert: TicketmasterConcert): BookingTargetCategory {
  if (concert.eventType === "festival") return "festival";
  return "event";
}

function countUniqueVenues(targets: BookingTarget[]): number {
  return new Set(targets.map((target) => normalizeKey(target.venueName ?? target.name)).filter(Boolean)).size;
}

function logTopOpportunities(targets: BookingTarget[]): void {
  const top = [...targets].sort((left, right) => right.confidence - left.confidence).slice(0, 5);
  debugLog("ticketmaster", "Top opportunities:");
  for (const target of top) {
    const viaSimilarArtist = target.derivedFromSimilarArtist ? ` (via similar artist ${target.derivedFromSimilarArtist.name})` : "";
    debugLog("ticketmaster", `${target.confidence.toFixed(2)} | ${target.eventDate ?? "unknown date"} | ${target.name} | ${target.venueName ?? "unknown venue"} | ${target.city ?? "unknown city"}${viaSimilarArtist}`);
  }
}

function dedupeConcerts(concerts: TicketmasterConcert[]): TicketmasterConcert[] {
  const seen = new Set<string>();
  return concerts.filter((concert) => {
    const key = [
      normalizeKey(concert.name),
      concert.date.localDate,
      normalizeKey(concert.venue?.name ?? ""),
      normalizeKey(concert.venue?.city ?? "")
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
