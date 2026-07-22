import { toDateOnlyString } from "../utils/dateOnly.js";
import { normalizeKey, normalizeVenueName } from "../utils/venueNameNormalization.js";
import type { TicketmasterConcert } from "../providers/ticketmaster/normalizeTicketmasterEvent.js";
import type { TicketmasterDiagnostics } from "../providers/ticketmaster/TicketmasterClient.js";
import type { SimilarArtistTicketmasterEvents, TicketmasterSearchOutcome } from "../providers/ticketmaster/types.js";
import type { BookingOpportunity, BookingSearchResult } from "../booking/types.js";

export interface TicketmasterVenueEvidence {
  venue: {
    ticketmasterId?: string;
    name: string;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    url?: string;
  };
  matchingArtists: Array<{
    artistId?: string;
    artistName: string;
    compatibilityScore?: number;
    attractionId?: string;
    eventId: string;
    eventDate: string;
    eventStatus: "past" | "upcoming";
    sourceUrl?: string;
  }>;
  pastEventCount: number;
  upcomingEventCount: number;
  matchingArtistCount: number;
  averageArtistCompatibility?: number;
  latestEventDate?: string;
  venueCompatibilityScore?: number;
}

export interface TicketmasterSceneEvidence {
  city: string;
  region?: string;
  country?: string;
  matchingEventCount: number;
  matchingArtistCount: number;
  averageCompatibilityScore?: number;
  upcomingEventCount: number;
}

/**
 * Aggregates venue evidence across every similar artist's Ticketmaster
 * events (issue #189). A venue ranks higher when several compatible
 * similar artists are linked to it, its events are recent, and it has
 * upcoming activity — never merely because it came from Ticketmaster.
 * "Recurring venue" is simply matchingArtistCount > 1, not a separate
 * subsystem.
 */
export function aggregateVenueEvidence(entries: SimilarArtistTicketmasterEvents[], now: Date = new Date()): TicketmasterVenueEvidence[] {
  const byVenue = new Map<string, TicketmasterVenueEvidence>();

  for (const { artist, pastEvents, upcomingEvents } of entries) {
    for (const concert of [...upcomingEvents, ...pastEvents]) {
      if (!concert.venue?.name) {
        continue;
      }
      const key = normalizeVenueName(concert.venue.name, concert.venue.city ?? null) + "|" + normalizeKey(concert.venue.city ?? "");
      const existing = byVenue.get(key);
      const matchEntry = {
        artistId: artist.spotifyId ?? undefined,
        artistName: artist.name,
        compatibilityScore: artist.totalRelevance,
        eventId: concert.eventId,
        eventDate: concert.date.localDate,
        eventStatus: (concert.status === "past" ? "past" : "upcoming") as "past" | "upcoming",
        sourceUrl: concert.url
      };

      if (existing) {
        existing.matchingArtists.push(matchEntry);
      } else {
        byVenue.set(key, {
          venue: {
            ticketmasterId: concert.venue.ticketmasterId,
            name: concert.venue.name,
            city: concert.venue.city,
            region: concert.venue.region,
            country: concert.venue.country,
            latitude: concert.venue.latitude,
            longitude: concert.venue.longitude,
            url: concert.venue.url
          },
          matchingArtists: [matchEntry],
          pastEventCount: 0,
          upcomingEventCount: 0,
          matchingArtistCount: 0
        });
      }
    }
  }

  return [...byVenue.values()].map((evidence) => finalizeVenueEvidence(evidence, now));
}

function finalizeVenueEvidence(evidence: TicketmasterVenueEvidence, now: Date): TicketmasterVenueEvidence {
  const pastEventCount = evidence.matchingArtists.filter((match) => match.eventStatus === "past").length;
  const upcomingEventCount = evidence.matchingArtists.filter((match) => match.eventStatus === "upcoming").length;
  const matchingArtistCount = new Set(evidence.matchingArtists.map((match) => normalizeKey(match.artistName))).size;
  const compatibilityScores = evidence.matchingArtists
    .map((match) => match.compatibilityScore)
    .filter((score): score is number => typeof score === "number");
  const averageArtistCompatibility = compatibilityScores.length > 0
    ? compatibilityScores.reduce((sum, score) => sum + score, 0) / compatibilityScores.length
    : undefined;
  const latestEventDate = evidence.matchingArtists
    .map((match) => match.eventDate)
    .sort()
    .at(-1);

  const recencyBonus = latestEventDate && monthsSince(latestEventDate, now) <= 12 ? 0.15 : 0;
  const artistCountBonus = Math.min(0.3, (matchingArtistCount - 1) * 0.1);
  const compatibilityBonus = averageArtistCompatibility ? (averageArtistCompatibility / 100) * 0.3 : 0;
  const upcomingBonus = upcomingEventCount > 0 ? 0.15 : 0;
  const venueCompatibilityScore = Math.max(0, Math.min(1, 0.1 + artistCountBonus + compatibilityBonus + recencyBonus + upcomingBonus));

  return {
    ...evidence,
    pastEventCount,
    upcomingEventCount,
    matchingArtistCount,
    averageArtistCompatibility,
    latestEventDate,
    venueCompatibilityScore
  };
}

/** Recurring-venue signal: a venue linked to more than one similar artist. */
export function isRecurringVenue(evidence: TicketmasterVenueEvidence): boolean {
  return evidence.matchingArtistCount > 1;
}

/**
 * Aggregates similar-artist events by city/region (issue #189 "geographic
 * scene detection") — can reveal cities where the target genre is
 * particularly active beyond the artist's own city.
 */
export function aggregateSceneEvidence(entries: SimilarArtistTicketmasterEvents[]): TicketmasterSceneEvidence[] {
  const byCity = new Map<string, TicketmasterSceneEvidence & { artistNames: Set<string>; compatibilityScores: number[] }>();

  for (const { artist, pastEvents, upcomingEvents } of entries) {
    for (const concert of [...upcomingEvents, ...pastEvents]) {
      const city = concert.venue?.city;
      if (!city) {
        continue;
      }
      const key = normalizeKey(city);
      const existing = byCity.get(key);
      if (existing) {
        existing.matchingEventCount += 1;
        existing.upcomingEventCount += concert.status === "upcoming" ? 1 : 0;
        existing.artistNames.add(normalizeKey(artist.name));
        existing.compatibilityScores.push(artist.totalRelevance);
      } else {
        byCity.set(key, {
          city,
          region: concert.venue?.region ?? undefined,
          country: concert.venue?.country ?? undefined,
          matchingEventCount: 1,
          matchingArtistCount: 0,
          upcomingEventCount: concert.status === "upcoming" ? 1 : 0,
          artistNames: new Set([normalizeKey(artist.name)]),
          compatibilityScores: [artist.totalRelevance]
        });
      }
    }
  }

  return [...byCity.values()].map(({ artistNames, compatibilityScores, ...scene }) => ({
    ...scene,
    matchingArtistCount: artistNames.size,
    averageCompatibilityScore: compatibilityScores.length > 0
      ? compatibilityScores.reduce((sum, score) => sum + score, 0) / compatibilityScores.length
      : undefined
  }));
}

/**
 * Builds a lookup from normalized venue identity to matchingArtistCount, so
 * per-event scoring (TicketmasterBookingSourceProvider) can factor in real
 * cross-artist venue evidence instead of a constant placeholder.
 */
export function buildVenueEvidenceCountLookup(evidence: TicketmasterVenueEvidence[]): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const entry of evidence) {
    const key = normalizeVenueName(entry.venue.name, entry.venue.city ?? null) + "|" + normalizeKey(entry.venue.city ?? "");
    lookup.set(key, entry.matchingArtistCount);
  }
  return lookup;
}

export function venueEvidenceKeyFor(concert: TicketmasterConcert): string | null {
  if (!concert.venue?.name) {
    return null;
  }
  return normalizeVenueName(concert.venue.name, concert.venue.city ?? null) + "|" + normalizeKey(concert.venue.city ?? "");
}

function monthsSince(dateStr: string, now: Date): number {
  const target = toDateOnlyString(dateStr);
  const today = toDateOnlyString(now);
  if (!target || !today) {
    return Number.POSITIVE_INFINITY;
  }
  const left = new Date(`${target}T00:00:00Z`);
  const right = new Date(`${today}T00:00:00Z`);
  return Math.max(0, (right.getFullYear() - left.getFullYear()) * 12 + (right.getMonth() - left.getMonth()));
}

export interface TicketmasterPipelineSection {
  opportunities: BookingOpportunity[];
  similarArtistEvents: SimilarArtistTicketmasterEvents[];
  venueEvidence: TicketmasterVenueEvidence[];
  sceneEvidence: TicketmasterSceneEvidence[];
  diagnostics?: TicketmasterDiagnostics;
}

/**
 * Ticketmaster's own raw search outcome (similar-artist events, per-artist
 * attraction resolution, diagnostics) rides inside the provider's own
 * metadata bag on BookingSourceProviderResult — the same convention every
 * other provider already uses for structured diagnostic data — so the
 * pipeline can build the richer evidence sections below without a second
 * round of Ticketmaster API calls. Returns null defensively rather than
 * throwing if the shape doesn't match (e.g. the provider was disabled).
 */
export function extractTicketmasterSearchOutcome(bookingSearch: BookingSearchResult): TicketmasterSearchOutcome | null {
  const entry = bookingSearch.sourceMetadata.find((meta) => meta.sourceProvider === "ticketmaster");
  const candidate = entry?.metadata?.searchOutcome as Partial<TicketmasterSearchOutcome> | undefined;
  if (!candidate || !Array.isArray(candidate.genreLocationEvents) || !Array.isArray(candidate.similarArtistEvents) || !candidate.diagnostics) {
    return null;
  }
  return candidate as TicketmasterSearchOutcome;
}

/**
 * Assembles the `ticketmaster` section of OpportunitySearchRunResult.
 * `opportunities` is a filtered view of the booking pipeline's own scored
 * opportunities (never a second, independent scoring/ranking system) —
 * Ticketmaster opportunities already went through the same relevance
 * filter, scoring and cross-provider dedup as every other source.
 */
export function buildTicketmasterPipelineSection(bookingSearch: BookingSearchResult): TicketmasterPipelineSection | undefined {
  const outcome = extractTicketmasterSearchOutcome(bookingSearch);
  if (!outcome) {
    return undefined;
  }
  return {
    opportunities: bookingSearch.opportunities.filter((opportunity) => opportunity.sourceProvider === "ticketmaster"),
    similarArtistEvents: outcome.similarArtistEvents,
    venueEvidence: aggregateVenueEvidence(outcome.similarArtistEvents),
    sceneEvidence: aggregateSceneEvidence(outcome.similarArtistEvents),
    diagnostics: outcome.diagnostics
  };
}
