// Issue #203: builds venue recommendations from comparable (similar)
// artists' actual concert history, instead of generic genre keywords or web
// search alone. Composes three optional evidence sources — structured
// concert-history results (findSimilarArtistConcerts, issue #182's
// ArtistConcert), a provider-neutral structured event-history source
// (HistoricalArtistEvent — the same shape used by the existing OpenAgenda/
// MusicBrainz adapters, so a future Chartmetric events adapter plugs in here
// too without any change to this module — issue requirement "the feature
// works when Chartmetric is unavailable by falling back to existing event
// sources"), and scraped venue/organization candidates (BookingTarget) — into
// deduplicated, evidence-backed, ranked venue recommendations.
import {
  matchBookingGenres
} from "../booking/genreMatching.js";
import { sanitizeRawTitle } from "../booking/eventPageExtraction.js";
import type { HistoricalArtistEvent } from "../booking/artistEventHistory.js";
import type { BookingTarget, BookingTargetCategory, ContactCandidate } from "../booking/types.js";
import type { ArtistConcert } from "../providers/concerts/ArtistConcertProvider.js";
import type { SimilarArtistConcertsResult } from "./similarArtistConcerts.js";
import {
  scoreVenueCompatibility,
  type VenueCompatibilityScoreResult
} from "../scoring/venueCompatibilityScore.js";
import { normalizeKey, normalizeVenueName } from "../utils/venueNameNormalization.js";
import { toDateOnlyString } from "../utils/dateOnly.js";

// Physical, bookable places only — organizations that merely organize shows
// (association, collective, promoter) or one-off structures (festival,
// open_call, springboard, booking_agency, live_producer, event) are never
// treated as a venue identity here, matching the venue/organization split
// already established for live-music entities (issue #183).
const VENUE_LIKE_CATEGORIES: ReadonlySet<BookingTargetCategory> = new Set(["venue", "bar"]);

const AGGREGATOR_DOMAINS = new Set([
  "bandsintown.com",
  "songkick.com",
  "setlist.fm",
  "ticketmaster.com",
  "dice.fm",
  "shotgun.live",
  "eventbrite.com",
  "facebook.com",
  "instagram.com",
  "youtube.com"
]);

export interface VenueRecommendationFilterOptions {
  country?: string | null;
  city?: string | null;
  /** Requires referenceLatitude/referenceLongitude; a venue with no known coordinates is excluded rather than assumed in-range. */
  radiusKm?: number | null;
  referenceLatitude?: number | null;
  referenceLongitude?: number | null;
  venueType?: BookingTargetCategory[] | null;
}

export interface VenueEvidenceEntry {
  comparableArtistName: string | null;
  comparableArtistScaleScore: number | null;
  eventName: string | null;
  eventDate: string | null;
  sourceUrl: string | null;
  sourceProvider: string;
  genres: string[];
  confidence: number;
}

export interface VenueRecommendation {
  venueId: string;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  venueType: BookingTargetCategory | "unknown";
  estimatedCapacity: number | null;
  /** Only ever populated from evidence sources — never invented (issue requirement). */
  contacts: ContactCandidate[];
  genres: string[];
  comparableArtists: string[];
  evidence: VenueEvidenceEntry[];
  relevantEventCount: number;
  medianArtistScale: number | null;
  minArtistScale: number | null;
  maxArtistScale: number | null;
  latestEventDate: string | null;
  sourceUrls: string[];
  conflictingSources: boolean;
  score: VenueCompatibilityScoreResult;
}

export type VenueRejectionReason =
  | "generic_or_seo_title"
  | "festival_not_venue"
  | "organization_not_venue"
  | "insufficient_evidence";

export interface RejectedVenueCandidate {
  rawName: string;
  sourceUrl: string | null;
  reason: VenueRejectionReason;
}

export interface FindVenueRecommendationsInput {
  targetArtist: {
    name: string;
    genres: string[];
    city?: string | null;
    country?: string | null;
    /** The analyzed artist's own 0-100 artist-scale score (issue #202), when available. */
    artistScaleScore?: number | null;
  };
  /** Output of findSimilarArtistConcerts() — the primary comparable-artist concert-history source. */
  concertHistory?: SimilarArtistConcertsResult[];
  /**
   * Provider-neutral structured historical events (OpenAgenda, MusicBrainz,
   * and — once available — Chartmetric). Optional and purely additive: the
   * pipeline produces recommendations from concertHistory/scrapedVenueCandidates
   * alone when this is omitted or empty.
   */
  structuredHistoricalEvents?: HistoricalArtistEvent[];
  /** Scraped venue/organization candidates, e.g. from VenueDiscoveryBookingSourceProvider. */
  scrapedVenueCandidates?: BookingTarget[];
  /** Comparable artist name -> 0-100 artist-scale score (issue #202), when known. */
  artistScaleByName?: Record<string, number>;
  filter?: VenueRecommendationFilterOptions;
  now?: Date;
}

export interface FindVenueRecommendationsResult {
  recommendations: VenueRecommendation[];
  rejected: RejectedVenueCandidate[];
  warnings: string[];
}

interface RawVenueEvidenceItem {
  rawName: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceUrl: string | null;
  sourceProvider: string;
  comparableArtistName: string | null;
  comparableArtistScaleScore: number | null;
  eventName: string | null;
  eventDate: string | null;
  genres: string[];
  confidence: number;
  estimatedCapacity: number | null;
  contacts: ContactCandidate[];
  venueType: BookingTargetCategory | "unknown";
}

export function findVenueRecommendations(input: FindVenueRecommendationsInput): FindVenueRecommendationsResult {
  const now = input.now ?? new Date();
  const rejected: RejectedVenueCandidate[] = [];
  const warnings: string[] = [];

  const rawItems: RawVenueEvidenceItem[] = [
    ...fromConcertHistory(input.concertHistory ?? [], input.artistScaleByName ?? {}, rejected),
    ...fromStructuredHistoricalEvents(input.structuredHistoricalEvents ?? [], input.artistScaleByName ?? {}),
    ...fromScrapedVenueCandidates(input.scrapedVenueCandidates ?? [], rejected)
  ];

  const sanitizedItems: RawVenueEvidenceItem[] = [];
  for (const item of rawItems) {
    const sanitizedName = sanitizeRawTitle(item.rawName);
    if (!sanitizedName) {
      rejected.push({ rawName: item.rawName, sourceUrl: item.sourceUrl, reason: "generic_or_seo_title" });
      continue;
    }
    sanitizedItems.push({ ...item, rawName: sanitizedName });
  }

  const groups = groupVenueEvidence(sanitizedItems);

  const recommendations: VenueRecommendation[] = [];
  for (const group of groups) {
    const comparableEvidence = group.items.filter((item) => item.comparableArtistName);
    if (comparableEvidence.length === 0) {
      rejected.push({ rawName: group.items[0].rawName, sourceUrl: group.items[0].sourceUrl, reason: "insufficient_evidence" });
      continue;
    }

    const recommendation = buildRecommendation(group, input.targetArtist, now, input.filter);
    recommendations.push(recommendation);
  }

  const filtered = applyFilter(recommendations, input.filter);

  filtered.sort((left, right) => {
    if (right.score.venueCompatibilityScore !== left.score.venueCompatibilityScore) {
      return right.score.venueCompatibilityScore - left.score.venueCompatibilityScore;
    }
    return left.name.localeCompare(right.name);
  });

  return { recommendations: filtered, rejected, warnings };
}

function fromConcertHistory(
  results: SimilarArtistConcertsResult[],
  artistScaleByName: Record<string, number>,
  rejected: RejectedVenueCandidate[]
): RawVenueEvidenceItem[] {
  const items: RawVenueEvidenceItem[] = [];

  for (const result of results) {
    const scaleScore = artistScaleByName[result.artist.name] ?? null;
    for (const concert of result.pastConcerts) {
      if (!concert.venue?.name) {
        continue;
      }

      if (isFestivalOccurrence(concert)) {
        rejected.push({
          rawName: concert.festivalName ?? concert.venue.name,
          sourceUrl: concert.sources[0]?.url ?? null,
          reason: "festival_not_venue"
        });
        continue;
      }

      items.push({
        rawName: concert.venue.name,
        city: concert.venue.city ?? null,
        country: concert.venue.country ?? null,
        latitude: concert.venue.latitude ?? null,
        longitude: concert.venue.longitude ?? null,
        sourceUrl: concert.sources[0]?.url ?? null,
        sourceProvider: concert.sources.map((source) => source.provider).join("+") || "unknown",
        comparableArtistName: result.artist.name,
        comparableArtistScaleScore: scaleScore,
        eventName: concert.name ?? null,
        eventDate: toDateOnlyString(concert.date),
        genres: result.artist.genres,
        confidence: concert.confidence ?? 0.5,
        estimatedCapacity: null,
        contacts: [],
        venueType: "unknown"
      });
    }
  }

  return items;
}

// A festival occurrence only fails to become a venue when the physical
// venue itself is indistinguishable from the festival (no distinct venue
// name reported, or the venue name is the festival name) — a real named
// venue that happens to host a festival is still a legitimate venue
// candidate (its evidence just also notes the festival context).
function isFestivalOccurrence(concert: ArtistConcert): boolean {
  if (!concert.festivalName) {
    return false;
  }
  return normalizeKey(concert.venue?.name ?? "") === normalizeKey(concert.festivalName);
}

function fromStructuredHistoricalEvents(
  events: HistoricalArtistEvent[],
  artistScaleByName: Record<string, number>
): RawVenueEvidenceItem[] {
  return events
    .filter((event): event is HistoricalArtistEvent & { venueName: string } => Boolean(event.venueName))
    .map((event) => ({
      rawName: event.venueName,
      city: event.city ?? null,
      country: event.country ?? null,
      latitude: null,
      longitude: null,
      sourceUrl: event.sourceUrl,
      sourceProvider: event.sourceProvider,
      comparableArtistName: event.artistName,
      comparableArtistScaleScore: artistScaleByName[event.artistName] ?? null,
      eventName: event.eventName ?? null,
      eventDate: event.eventDate ? toDateOnlyString(event.eventDate) : null,
      genres: [],
      confidence: event.confidence,
      estimatedCapacity: null,
      contacts: [],
      venueType: "unknown" as const
    }));
}

function fromScrapedVenueCandidates(
  candidates: BookingTarget[],
  rejected: RejectedVenueCandidate[]
): RawVenueEvidenceItem[] {
  const items: RawVenueEvidenceItem[] = [];

  for (const candidate of candidates) {
    if (!VENUE_LIKE_CATEGORIES.has(candidate.category)) {
      rejected.push({
        rawName: candidate.venueName ?? candidate.name,
        sourceUrl: candidate.sourceUrl,
        reason: candidate.category === "festival" ? "festival_not_venue" : "organization_not_venue"
      });
      continue;
    }

    const name = candidate.venueName ?? candidate.name;
    const shared = {
      city: candidate.city,
      country: candidate.country,
      latitude: null,
      longitude: null,
      sourceUrl: candidate.sourceUrl,
      sourceProvider: candidate.sourceProvider ?? candidate.sourceType,
      genres: candidate.genres,
      estimatedCapacity: candidate.estimatedCapacity ?? null,
      contacts: candidate.contacts,
      venueType: candidate.category
    };

    if (candidate.venueArtistEvidence && candidate.venueArtistEvidence.length > 0) {
      for (const evidence of candidate.venueArtistEvidence) {
        items.push({
          rawName: name,
          ...shared,
          sourceUrl: evidence.sourceUrl ?? shared.sourceUrl,
          sourceProvider: evidence.sourceProvider,
          comparableArtistName: evidence.similarArtistName ?? null,
          comparableArtistScaleScore: null,
          eventName: evidence.eventName ?? null,
          eventDate: evidence.eventDate ? toDateOnlyString(evidence.eventDate) : null,
          confidence: evidence.confidence
        });
      }
      continue;
    }

    items.push({
      rawName: name,
      ...shared,
      comparableArtistName: candidate.derivedFromSimilarArtist?.name ?? null,
      comparableArtistScaleScore: null,
      eventName: null,
      eventDate: toDateOnlyString(candidate.eventDate ?? "") ?? null,
      confidence: candidate.confidence
    });
  }

  return items;
}

interface VenueGroup {
  venueId: string;
  items: RawVenueEvidenceItem[];
}

// Primary identity: normalized name + city + country (same convention as
// artistEventHistory.ts's venueIdentity). Groups sharing an official
// (non-aggregator) domain and the same normalized city are then merged, so
// e.g. "Le Krakatoa" (from Bandsintown) and "Krakatoa Mérignac" (scraped
// from krakatoa.net) collapse into one venue instead of two — issue
// requirement: "Deduplicate venues using domain, address, normalized name,
// city, and provider IDs."
function groupVenueEvidence(items: RawVenueEvidenceItem[]): VenueGroup[] {
  const byPrimaryKey = new Map<string, RawVenueEvidenceItem[]>();
  for (const item of items) {
    const key = primaryVenueKey(item);
    const existing = byPrimaryKey.get(key);
    if (existing) {
      existing.push(item);
    } else {
      byPrimaryKey.set(key, [item]);
    }
  }

  const groups: VenueGroup[] = [...byPrimaryKey.entries()].map(([venueId, groupItems]) => ({ venueId, items: groupItems }));

  const merged: VenueGroup[] = [];
  for (const group of groups) {
    const domain = officialDomainFor(group.items);
    const city = normalizeKey(cityOf(group.items) ?? "");
    const mergeTarget = domain && city
      ? merged.find((existing) => officialDomainFor(existing.items) === domain && normalizeKey(cityOf(existing.items) ?? "") === city)
      : undefined;

    if (mergeTarget) {
      mergeTarget.items.push(...group.items);
    } else {
      merged.push(group);
    }
  }

  return merged;
}

function primaryVenueKey(item: RawVenueEvidenceItem): string {
  return [normalizeVenueName(item.rawName, item.city), normalizeKey(item.city ?? ""), normalizeKey(item.country ?? "")].join("|");
}

function cityOf(items: RawVenueEvidenceItem[]): string | null {
  return items.find((item) => item.city)?.city ?? null;
}

function officialDomainFor(items: RawVenueEvidenceItem[]): string | null {
  for (const item of items) {
    if (!item.sourceUrl) continue;
    try {
      const hostname = new URL(item.sourceUrl).hostname.replace(/^www\./, "");
      if (!AGGREGATOR_DOMAINS.has(hostname)) {
        return hostname;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function buildRecommendation(
  group: VenueGroup,
  targetArtist: FindVenueRecommendationsInput["targetArtist"],
  now: Date,
  filter: VenueRecommendationFilterOptions | undefined
): VenueRecommendation {
  const items = group.items;
  const bestByConfidence = [...items].sort((left, right) => right.confidence - left.confidence);

  const name = bestByConfidence[0].rawName;
  const city = pickField(items, (item) => item.city);
  const country = pickField(items, (item) => item.country);
  const latitude = bestByConfidence.find((item) => item.latitude !== null)?.latitude ?? null;
  const longitude = bestByConfidence.find((item) => item.longitude !== null)?.longitude ?? null;
  const venueType = bestByConfidence.find((item) => item.venueType !== "unknown")?.venueType ?? "unknown";

  const capacities = unique(items.map((item) => item.estimatedCapacity).filter((value): value is number => value !== null));
  const estimatedCapacity = capacities.length > 0
    ? bestByConfidence.find((item) => item.estimatedCapacity !== null)!.estimatedCapacity
    : null;

  const cities = unique(items.map((item) => item.city).filter((value): value is string => Boolean(value)).map(normalizeKey));
  const countries = unique(items.map((item) => item.country).filter((value): value is string => Boolean(value)).map(normalizeKey));
  const conflictingSources = capacities.length > 1 || cities.length > 1 || countries.length > 1;

  const contacts = dedupeContacts(items.flatMap((item) => item.contacts));
  const genres = unique(items.flatMap((item) => item.genres));

  const evidence: VenueEvidenceEntry[] = items
    .filter((item) => item.comparableArtistName)
    .map((item) => ({
      comparableArtistName: item.comparableArtistName,
      comparableArtistScaleScore: item.comparableArtistScaleScore,
      eventName: item.eventName,
      eventDate: item.eventDate,
      sourceUrl: item.sourceUrl,
      sourceProvider: item.sourceProvider,
      genres: item.genres,
      confidence: item.confidence
    }));

  const comparableArtists = unique(evidence.map((item) => item.comparableArtistName).filter((value): value is string => Boolean(value)));
  const relevantEventCount = unique(
    evidence.map((item) => `${item.comparableArtistName ?? ""}|${item.eventDate ?? ""}|${item.sourceUrl ?? ""}`)
  ).length;

  const scaleScores = evidence
    .map((item) => item.comparableArtistScaleScore)
    .filter((value): value is number => value !== null);
  const medianArtistScale = scaleScores.length > 0 ? median(scaleScores) : null;
  const minArtistScale = scaleScores.length > 0 ? Math.min(...scaleScores) : null;
  const maxArtistScale = scaleScores.length > 0 ? Math.max(...scaleScores) : null;

  const dates = evidence.map((item) => item.eventDate).filter((value): value is string => Boolean(value)).sort();
  const latestEventDate = dates.at(-1) ?? null;

  const sourceUrls = unique(items.map((item) => item.sourceUrl).filter((value): value is string => Boolean(value)));
  const sourceProviders = unique(evidence.map((item) => item.sourceProvider));

  const genreFitScore = genres.length > 0 ? matchBookingGenres(targetArtist.genres, genres).score : undefined;
  const geo = resolveGeography(targetArtist, { city, country, latitude, longitude }, filter);
  const latestEventDaysAgo = latestEventDate ? daysBetween(latestEventDate, now) : undefined;
  const sourceConfidenceAverage = evidence.length > 0
    ? evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length
    : undefined;

  const score = scoreVenueCompatibility({
    comparableArtistCount: comparableArtists.length,
    relevantEventCount,
    genreFitScore,
    targetArtistScaleScore: targetArtist.artistScaleScore ?? undefined,
    venueArtistScaleMedian: medianArtistScale ?? undefined,
    ...geo,
    latestEventDaysAgo,
    estimatedCapacity: estimatedCapacity ?? undefined,
    sourceConfidenceAverage,
    independentSourceCount: sourceProviders.length,
    conflictingSources
  });

  return {
    venueId: group.venueId,
    name,
    city,
    country,
    latitude,
    longitude,
    venueType,
    estimatedCapacity,
    contacts,
    genres,
    comparableArtists,
    evidence,
    relevantEventCount,
    medianArtistScale,
    minArtistScale,
    maxArtistScale,
    latestEventDate,
    sourceUrls,
    conflictingSources,
    score
  };
}

function resolveGeography(
  targetArtist: FindVenueRecommendationsInput["targetArtist"],
  venue: { city: string | null; country: string | null; latitude: number | null; longitude: number | null },
  filter: VenueRecommendationFilterOptions | undefined
): { distanceKm?: number; sameCity?: boolean; sameCountry?: boolean } {
  const sameCity = targetArtist.city ? normalizeKey(targetArtist.city) === normalizeKey(venue.city ?? "") : undefined;
  const sameCountry = targetArtist.country ? normalizeKey(targetArtist.country) === normalizeKey(venue.country ?? "") : undefined;

  // Distance only takes precedence over the city/country booleans when the
  // caller supplied a geocoded reference point (e.g. the artist's home
  // city) and the venue itself has coordinates — otherwise it stays
  // undefined rather than a fabricated "close enough" guess.
  if (filter?.referenceLatitude != null && filter.referenceLongitude != null && venue.latitude !== null && venue.longitude !== null) {
    const distanceKm = haversineDistanceKm(
      { latitude: filter.referenceLatitude, longitude: filter.referenceLongitude },
      { latitude: venue.latitude, longitude: venue.longitude }
    );
    return { distanceKm, sameCity, sameCountry };
  }

  return { sameCity, sameCountry };
}

function applyFilter(
  recommendations: VenueRecommendation[],
  filter: VenueRecommendationFilterOptions | undefined
): VenueRecommendation[] {
  if (!filter) {
    return recommendations;
  }

  return recommendations.filter((venue) => {
    if (filter.country && normalizeKey(venue.country ?? "") !== normalizeKey(filter.country)) {
      return false;
    }
    if (filter.city && normalizeKey(venue.city ?? "") !== normalizeKey(filter.city)) {
      return false;
    }
    if (filter.venueType && filter.venueType.length > 0 && !filter.venueType.includes(venue.venueType as BookingTargetCategory)) {
      return false;
    }
    if (filter.radiusKm !== undefined && filter.radiusKm !== null) {
      if (filter.referenceLatitude == null || filter.referenceLongitude == null || venue.latitude === null || venue.longitude === null) {
        return false;
      }
      const distance = haversineDistanceKm(
        { latitude: filter.referenceLatitude, longitude: filter.referenceLongitude },
        { latitude: venue.latitude, longitude: venue.longitude }
      );
      if (distance > filter.radiusKm) {
        return false;
      }
    }
    return true;
  });
}

function haversineDistanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function daysBetween(dateOnly: string, now: Date): number {
  const left = new Date(`${dateOnly}T00:00:00Z`);
  const right = new Date(`${toDateOnlyString(now) ?? now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((right.getTime() - left.getTime()) / (1000 * 60 * 60 * 24)));
}

function pickField<T>(items: RawVenueEvidenceItem[], accessor: (item: RawVenueEvidenceItem) => T | null): T | null {
  const sorted = [...items].sort((left, right) => right.confidence - left.confidence);
  const found = sorted.find((item) => accessor(item) !== null);
  return found ? accessor(found) : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function dedupeContacts(contacts: ContactCandidate[]): ContactCandidate[] {
  const seen = new Set<string>();
  return contacts.filter((contact) => {
    const key = `${contact.type}|${contact.value ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
