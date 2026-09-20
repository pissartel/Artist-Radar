import { normalizeKey, normalizeVenueName } from "../utils/venueNameNormalization.js";

export const VENUE_PROFILE_SCORE_VERSION = "venue-profile-v1";

const DAY_MS = 86_400_000;
const RECENCY_HALF_LIFE_DAYS = 365;
// Old history still contributes weak evidence instead of vanishing.
const MIN_EVENT_WEIGHT = 0.1;
// Shrinkage constant: a single one-off event yields at most 0.5 affinity.
const AFFINITY_SHRINKAGE = 1;
const MIN_SCALED_ARTISTS_FOR_SHARE = 3;
const EMERGING_SCALE_MAX = 35;
const MAX_RELEVANT_ARTISTS = 200;

export type VenueEventStatus = "upcoming" | "past" | "cancelled" | "unknown";
export type BillingRole = "headliner" | "support" | "unknown";

// Ordinal 0-100 position of each ArtistScaleBand (plus legacy tier labels).
const SCALE_BAND_VALUE: Record<string, number> = {
  emerging: 10, small: 15, developing: 30, medium: 45, established_local: 50, established: 55,
  regional: 70, large: 75, national: 85, major: 95
};

export function scaleBandToValue(band: string | null | undefined): number | null {
  if (!band) return null;
  return SCALE_BAND_VALUE[band.trim().toLowerCase()] ?? null;
}

export function normalizeGenreKey(genre: string): string {
  return normalizeKey(genre).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export interface EventArtistRecord {
  artistId: string;
  billingRole: BillingRole;
  genres: string[];
  /** 0-100 scale position, null when unknown. */
  scale: number | null;
}

/** Canonical (already deduplicated) event as read back from persistence. */
export interface CanonicalEventRecord {
  venueId: string;
  date: string;
  status: VenueEventStatus;
  confidence: number;
  promoterId?: string | null;
  artists: EventArtistRecord[];
}

/**
 * Everything here is inferred from observed events. Observed facts stay in
 * the event tables and declared venue facts in global_venues.declared.
 */
export interface VenueProgrammingProfile {
  venueId: string;
  dataOrigin: "inferred";
  normalizedGenres: string[];
  genreAffinityScores: Record<string, number>;
  relevantArtistIds: string[];
  medianArtistScale: number | null;
  minArtistScale: number | null;
  maxArtistScale: number | null;
  emergingArtistShare: number | null;
  eventsLast90Days: number;
  eventsLast365Days: number;
  latestKnownEventAt: string | null;
  promoterIds: string[];
  evidenceCount: number;
  confidence: number;
  scoreVersion: string;
  computedAt: string;
  nextRefreshAt: string;
}

export function eventWeight(eventDate: string, now: Date, eventConfidence: number): number {
  const ageDays = Math.max(0, (now.getTime() - Date.parse(eventDate)) / DAY_MS);
  const recency = Math.max(MIN_EVENT_WEIGHT, Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS));
  return recency * clamp01(eventConfidence);
}

export function computeVenueProgrammingProfile(
  venueId: string,
  events: CanonicalEventRecord[],
  now: Date = new Date(),
  scoreVersion: string = VENUE_PROFILE_SCORE_VERSION
): VenueProgrammingProfile {
  // Cancelled events stay stored but never count as positive programming.
  const positive = events.filter((event) => event.status !== "cancelled" && Number.isFinite(Date.parse(event.date)));
  const weighted = positive.map((event) => ({ event, weight: eventWeight(event.date, now, event.confidence) }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);

  const genreRaw = new Map<string, number>();
  let genreWeight = 0;
  for (const { event, weight } of weighted) {
    const withGenres = event.artists.filter((artist) => artist.genres.length > 0);
    if (withGenres.length === 0) continue;
    genreWeight += weight;
    const perGenre = new Map<string, number>();
    for (const artist of withGenres) {
      for (const genre of new Set(artist.genres.map(normalizeGenreKey).filter(Boolean))) {
        perGenre.set(genre, (perGenre.get(genre) ?? 0) + 1);
      }
    }
    for (const [genre, count] of perGenre) {
      genreRaw.set(genre, (genreRaw.get(genre) ?? 0) + weight * (count / withGenres.length));
    }
  }
  const genreAffinityScores: Record<string, number> = {};
  for (const [genre, raw] of [...genreRaw].sort((a, b) => b[1] - a[1])) {
    genreAffinityScores[genre] = round(raw / (genreWeight + AFFINITY_SHRINKAGE));
  }

  const artistWeight = new Map<string, number>();
  const artistScale = new Map<string, number | null>();
  for (const { event, weight } of weighted) {
    for (const artist of event.artists) {
      artistWeight.set(artist.artistId, (artistWeight.get(artist.artistId) ?? 0) + weight);
      const known = artistScale.get(artist.artistId);
      if (known === undefined || (known === null && artist.scale !== null)) artistScale.set(artist.artistId, artist.scale);
    }
  }
  const scales = [...artistScale.values()].filter((value): value is number => value !== null).sort((a, b) => a - b);
  const artistCount = artistScale.size;

  const promoterCounts = new Map<string, number>();
  for (const event of positive) {
    if (event.promoterId) promoterCounts.set(event.promoterId, (promoterCounts.get(event.promoterId) ?? 0) + 1);
  }

  const nowMs = now.getTime();
  const elapsed = positive.filter((event) => Date.parse(event.date) <= nowMs);
  const withinDays = (days: number) => elapsed.filter((event) => nowMs - Date.parse(event.date) <= days * DAY_MS).length;
  const latest = elapsed.map((event) => event.date).sort().at(-1) ?? null;

  const evidenceCount = positive.length;
  const confidence = profileConfidence({
    evidenceCount,
    meanRecencyWeight: evidenceCount ? totalWeight / evidenceCount : 0,
    genreCoverage: evidenceCount ? weighted.filter(({ event }) => event.artists.some((a) => a.genres.length > 0)).length / evidenceCount : 0,
    scaleCoverage: artistCount ? scales.length / artistCount : 0
  });

  return {
    venueId,
    dataOrigin: "inferred",
    normalizedGenres: Object.keys(genreAffinityScores),
    genreAffinityScores,
    relevantArtistIds: [...artistWeight].sort((a, b) => b[1] - a[1]).slice(0, MAX_RELEVANT_ARTISTS).map(([id]) => id),
    medianArtistScale: scales.length ? round(median(scales)) : null,
    minArtistScale: scales.length ? scales[0]! : null,
    maxArtistScale: scales.length ? scales.at(-1)! : null,
    emergingArtistShare: scales.length >= MIN_SCALED_ARTISTS_FOR_SHARE
      ? round(scales.filter((value) => value <= EMERGING_SCALE_MAX).length / scales.length)
      : null,
    eventsLast90Days: withinDays(90),
    eventsLast365Days: withinDays(365),
    latestKnownEventAt: latest,
    promoterIds: [...promoterCounts].filter(([, count]) => count >= 2).map(([id]) => id),
    evidenceCount,
    confidence,
    scoreVersion,
    computedAt: now.toISOString(),
    nextRefreshAt: new Date(nowMs + refreshTtlDays(confidence, latest, nowMs) * DAY_MS).toISOString()
  };
}

function profileConfidence(input: {
  evidenceCount: number; meanRecencyWeight: number; genreCoverage: number; scaleCoverage: number;
}): number {
  if (input.evidenceCount === 0) return 0;
  // Missing scale data lowers confidence (via scaleCoverage) but never invalidates the profile.
  const value = Math.min(1, input.evidenceCount / 8) * 0.5
    + clamp01(input.meanRecencyWeight) * 0.2
    + input.genreCoverage * 0.15
    + input.scaleCoverage * 0.15;
  return round(clamp01(value));
}

function refreshTtlDays(confidence: number, latest: string | null, nowMs: number): number {
  if (confidence < 0.4) return 7;
  const active = latest !== null && nowMs - Date.parse(latest) <= 90 * DAY_MS;
  return active ? 14 : 45;
}

export function isProfileStale(
  profile: Pick<VenueProgrammingProfile, "nextRefreshAt" | "scoreVersion">,
  now: Date = new Date(),
  scoreVersion: string = VENUE_PROFILE_SCORE_VERSION
): boolean {
  return profile.scoreVersion !== scoreVersion || Date.parse(profile.nextRefreshAt) <= now.getTime();
}

export interface VenueFitInput {
  genres: string[];
  /** 0-100 scale position of the artist being matched, when known. */
  scale?: number | null;
  /** Persisted ids of the artist's similarity neighbourhood. */
  similarArtistIds?: string[];
}

export interface VenueFitResult {
  score: number;
  genreScore: number;
  comparableArtistScore: number;
  scaleScore: number | null;
  recencyScore: number;
  confidence: number;
  reasons: string[];
}

/**
 * Genre and comparable-artist evidence dominate; scale refines, and audience
 * size alone never earns a venue points (genre compatibility outranks size).
 */
export function scoreVenueProfileFit(
  profile: VenueProgrammingProfile,
  input: VenueFitInput,
  now: Date = new Date()
): VenueFitResult {
  const reasons: string[] = [];
  const genres = [...new Set(input.genres.map(normalizeGenreKey).filter(Boolean))];
  const genreScore = genres.length
    ? Math.max(...genres.map((genre) => profile.genreAffinityScores[genre] ?? 0))
    : 0;
  if (genreScore > 0) reasons.push(`Programs ${genres.filter((g) => (profile.genreAffinityScores[g] ?? 0) === genreScore)[0]} (affinity ${genreScore})`);

  const known = new Set(profile.relevantArtistIds);
  const matches = (input.similarArtistIds ?? []).filter((id) => known.has(id)).length;
  const comparableArtistScore = round(1 - Math.pow(0.5, matches));
  if (matches > 0) reasons.push(`Hosted ${matches} comparable artist${matches > 1 ? "s" : ""}`);

  let scaleScore: number | null = null;
  if (typeof input.scale === "number" && profile.minArtistScale !== null && profile.maxArtistScale !== null && profile.medianArtistScale !== null) {
    const inRange = input.scale >= profile.minArtistScale && input.scale <= profile.maxArtistScale;
    const distance = inRange ? 0 : Math.min(Math.abs(input.scale - profile.minArtistScale), Math.abs(input.scale - profile.maxArtistScale));
    scaleScore = round(clamp01(1 - distance / 50) * (inRange ? 1 - Math.abs(input.scale - profile.medianArtistScale) / 200 : 0.8));
    reasons.push(inRange ? "Artist scale within the venue's programmed range" : "Artist scale outside the venue's programmed range");
  }

  const recencyScore = profile.latestKnownEventAt
    ? round(Math.max(0, 1 - (now.getTime() - Date.parse(profile.latestKnownEventAt)) / (730 * DAY_MS)))
    : 0;
  if (profile.eventsLast365Days > 0) reasons.push(`${profile.eventsLast365Days} events in the last 12 months`);

  const weights = { genre: 0.4, comparable: 0.3, scale: 0.2, recency: 0.1 };
  const activeWeight = weights.genre + weights.comparable + weights.recency + (scaleScore === null ? 0 : weights.scale);
  const raw = (genreScore * weights.genre + comparableArtistScore * weights.comparable
    + (scaleScore ?? 0) * weights.scale + recencyScore * weights.recency) / activeWeight;
  // A shaky profile is discounted instead of trusted at face value.
  const score = Math.round(clamp01(raw * (0.5 + 0.5 * profile.confidence)) * 100);
  return { score, genreScore, comparableArtistScore, scaleScore, recencyScore, confidence: profile.confidence, reasons };
}

export interface VenueEventObservation {
  provider: string;
  externalId?: string | null;
  url?: string | null;
  name?: string | null;
  date: string;
  status?: VenueEventStatus;
  venue: { name: string; city?: string | null; country?: string | null; latitude?: number | null; longitude?: number | null };
  artists: Array<{
    name: string;
    spotifyId?: string | null;
    musicBrainzId?: string | null;
    billingRole?: BillingRole;
    genres?: string[];
    scaleBand?: string | null;
  }>;
  promoterName?: string | null;
  confidence: number;
}

export interface MergedVenueEvent {
  canonicalKey: string;
  venueKey: string;
  venue: VenueEventObservation["venue"];
  name: string | null;
  date: string;
  status: VenueEventStatus;
  confidence: number;
  promoterName: string | null;
  artists: VenueEventObservation["artists"];
  sources: Array<{ provider: string; externalId: string; url: string | null; confidence: number }>;
}

export function venueIdentityKey(venue: { name: string; city?: string | null }): string {
  return `${normalizeVenueName(venue.name, venue.city ?? null)}|${normalizeKey(venue.city ?? "")}`;
}

export function canonicalEventKey(observation: Pick<VenueEventObservation, "venue" | "date">): string {
  return `${venueIdentityKey(observation.venue)}|${observation.date.slice(0, 10)}`;
}

/**
 * Collapses observations of the same venue+date from several providers into
 * one canonical event, keeping every source as provenance. A cancellation
 * reported by any source wins; otherwise status follows the event date.
 */
export function mergeEventObservations(
  observations: VenueEventObservation[],
  now: Date = new Date()
): { events: MergedVenueEvent[]; duplicatesMerged: number } {
  const groups = new Map<string, MergedVenueEvent>();
  let duplicatesMerged = 0;
  for (const observation of observations) {
    if (!observation.venue.name.trim() || !Number.isFinite(Date.parse(observation.date))) continue;
    const key = canonicalEventKey(observation);
    const source = {
      provider: observation.provider, externalId: observation.externalId ?? "",
      url: observation.url ?? null, confidence: clamp01(observation.confidence)
    };
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        canonicalKey: key, venueKey: venueIdentityKey(observation.venue), venue: observation.venue,
        name: observation.name ?? null, date: observation.date.slice(0, 10),
        status: observation.status ?? "unknown", confidence: source.confidence,
        promoterName: observation.promoterName ?? null, artists: [...observation.artists], sources: [source]
      });
      continue;
    }
    const duplicateSource = existing.sources.some((s) => s.provider === source.provider && s.externalId === source.externalId);
    if (!duplicateSource) {
      duplicatesMerged += 1;
      existing.sources.push(source);
      // Independent confirmation nudges confidence up, never above 1.
      existing.confidence = Math.min(1, Math.max(existing.confidence, source.confidence) + 0.05);
    }
    if (observation.status === "cancelled") existing.status = "cancelled";
    else if (existing.status === "unknown" && observation.status) existing.status = observation.status;
    existing.name ??= observation.name ?? null;
    existing.promoterName ??= observation.promoterName ?? null;
    for (const artist of observation.artists) {
      const index = existing.artists.findIndex((known) => artistMatches(known, artist));
      if (index === -1) existing.artists.push(artist);
      else existing.artists[index] = mergeArtist(existing.artists[index]!, artist);
    }
  }
  const events = [...groups.values()].map((event) => ({
    ...event,
    status: event.status === "unknown" ? statusFromDate(event.date, now) : event.status
  }));
  return { events, duplicatesMerged };
}

function statusFromDate(date: string, now: Date): VenueEventStatus {
  return Date.parse(date) >= startOfDay(now) ? "upcoming" : "past";
}

function startOfDay(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function artistMatches(a: VenueEventObservation["artists"][number], b: VenueEventObservation["artists"][number]): boolean {
  if (a.spotifyId && b.spotifyId) return a.spotifyId === b.spotifyId;
  return normalizeKey(a.name) === normalizeKey(b.name);
}

function mergeArtist(a: VenueEventObservation["artists"][number], b: VenueEventObservation["artists"][number]) {
  return {
    ...a,
    spotifyId: a.spotifyId ?? b.spotifyId ?? null,
    musicBrainzId: a.musicBrainzId ?? b.musicBrainzId ?? null,
    billingRole: a.billingRole && a.billingRole !== "unknown" ? a.billingRole : b.billingRole ?? "unknown",
    genres: [...new Set([...(a.genres ?? []), ...(b.genres ?? [])])],
    scaleBand: a.scaleBand ?? b.scaleBand ?? null
  };
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
