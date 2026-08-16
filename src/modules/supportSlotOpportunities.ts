import { matchBookingGenres } from "../booking/genreMatching.js";
import type { ContactCandidate } from "../booking/types.js";
import type { ArtistConcert } from "../providers/concerts/ArtistConcertProvider.js";
import type { SimilarArtist } from "../schemas.js";
import { toDateOnlyString } from "../utils/dateOnly.js";
import type { SimilarArtistConcertsResult } from "./similarArtistConcerts.js";

export type SupportLineupStatus =
  | "no_support_announced"
  | "lineup_uncertain"
  | "support_announced"
  | "additional_support_explicitly_open";

export type HeadlinerScaleFit = "realistic_step_up" | "ambitious_plausible" | "too_large_unrealistic" | "unknown";

export interface SupportSlotThresholds {
  minimumGenreCompatibility: number;
  minimumScaleGap: number;
  ambitiousScaleGap: number;
  maximumScaleGap: number;
}

export const DEFAULT_SUPPORT_SLOT_THRESHOLDS: SupportSlotThresholds = {
  minimumGenreCompatibility: 65,
  minimumScaleGap: 5,
  ambitiousScaleGap: 25,
  maximumScaleGap: 50
};

export interface SupportLineupEvidence {
  provider: string;
  sourceUrl: string | null;
  observedLineup: string[];
  collectedAt: string;
}

export interface SupportSlotOpportunity {
  headliner: string;
  headlinerGenres: string[];
  headlinerScaleScore: number | null;
  artistScaleScore: number | null;
  scaleDifference: number | null;
  scaleFit: HeadlinerScaleFit;
  genreCompatibilityScore: number;
  musicalCompatibilityReason: string;
  date: string;
  venue: string;
  city: string;
  country: string;
  eventUrl: string;
  promoterOrganizer: string | null;
  lineupStatus: Exclude<SupportLineupStatus, "support_announced">;
  lineupConfidence: "high" | "medium" | "low";
  lineupEvidence: SupportLineupEvidence[];
  publicContactRoute: ContactCandidate | null;
  supportOpportunityScore: number;
  wording: "Potential support opportunity" | "Lineup incomplete — support availability unverified";
  sourceTimestamps: string[];
}

export interface RejectedSupportSlotEvent {
  headliner: string;
  eventName: string | null;
  reason:
    | "outside_reference_country"
    | "cancelled_or_not_upcoming"
    | "festival"
    | "weak_genre_match"
    | "headliner_not_larger"
    | "extreme_scale_mismatch"
    | "support_already_announced"
    | "missing_required_event_data";
}

export interface FindSupportSlotOpportunitiesInput {
  targetArtist: { name: string; genres: string[]; country?: string | null; artistScaleScore?: number | null };
  referenceCountry?: string | null;
  concertHistory: SimilarArtistConcertsResult[];
  artistScaleByName?: Record<string, number>;
  thresholds?: Partial<SupportSlotThresholds>;
  now?: Date;
}

export interface FindSupportSlotOpportunitiesResult {
  referenceCountry: string | null;
  referenceCountrySource: "user_input" | "artist_profile" | "unresolved";
  opportunities: SupportSlotOpportunity[];
  rejected: RejectedSupportSlotEvent[];
  warnings: string[];
}

const ADDITIONAL_SUPPORT_OPEN_PATTERN = /\b(additional support|more support|support tba|guests? tba|plus guests?|opening slot open)\b/i;

export function resolveSupportReferenceCountry(
  explicitCountry?: string | null,
  profileCountry?: string | null
): Pick<FindSupportSlotOpportunitiesResult, "referenceCountry" | "referenceCountrySource"> {
  const explicit = clean(explicitCountry);
  if (explicit) return { referenceCountry: explicit, referenceCountrySource: "user_input" };
  const profile = clean(profileCountry);
  if (profile) return { referenceCountry: profile, referenceCountrySource: "artist_profile" };
  return { referenceCountry: null, referenceCountrySource: "unresolved" };
}

export function findSupportSlotOpportunities(
  input: FindSupportSlotOpportunitiesInput
): FindSupportSlotOpportunitiesResult {
  const countryResolution = resolveSupportReferenceCountry(input.referenceCountry, input.targetArtist.country);
  if (!countryResolution.referenceCountry) {
    return { ...countryResolution, opportunities: [], rejected: [], warnings: ["Support-slot discovery skipped because no reference country could be resolved."] };
  }

  const now = input.now ?? new Date();
  const collectedAt = now.toISOString();
  const thresholds = { ...DEFAULT_SUPPORT_SLOT_THRESHOLDS, ...input.thresholds };
  const opportunities: SupportSlotOpportunity[] = [];
  const rejected: RejectedSupportSlotEvent[] = [];

  for (const history of input.concertHistory) {
    for (const event of history.upcomingConcerts) {
      const rejection = rejectEvent(event, history.artist, input, countryResolution.referenceCountry, thresholds, now);
      if (rejection) {
        rejected.push({ headliner: history.artist.name, eventName: event.name ?? null, reason: rejection });
        continue;
      }

      const lineup = assessSupportLineup(event, history.artist.name);
      if (lineup.status === "support_announced") {
        rejected.push({ headliner: history.artist.name, eventName: event.name ?? null, reason: "support_already_announced" });
        continue;
      }

      const genreMatch = matchBookingGenres(input.targetArtist.genres, history.artist.genres, history.artist.reason);
      const headlinerScale = resolveHeadlinerScale(history.artist, input.artistScaleByName);
      const artistScale = input.targetArtist.artistScaleScore ?? null;
      const scaleDifference = headlinerScale !== null && artistScale !== null ? headlinerScale - artistScale : null;
      const scaleFit = classifyScaleFit(scaleDifference, history.artist, thresholds);
      const sourceUrls = event.sources.map((source) => source.url).filter((url): url is string => Boolean(url));
      const eventUrl = sourceUrls[0]!;
      const observedLineup = event.lineup?.map((artist) => artist.name) ?? [];
      const lineupEvidence = event.sources.map((source): SupportLineupEvidence => ({
        provider: source.provider,
        sourceUrl: source.url ?? null,
        observedLineup,
        collectedAt
      }));

      const score = scoreOpportunity({
        genre: genreMatch.score,
        scaleFit,
        lineupStatus: lineup.status,
        lineupConfidence: lineup.confidence,
        sourceCount: event.sources.length,
        eventConfidence: event.confidence ?? 0.5
      });

      opportunities.push({
        headliner: history.artist.name,
        headlinerGenres: history.artist.genres,
        headlinerScaleScore: headlinerScale,
        artistScaleScore: artistScale,
        scaleDifference,
        scaleFit,
        genreCompatibilityScore: genreMatch.score,
        musicalCompatibilityReason: `${genreMatch.level} genre compatibility (${genreMatch.score}/100): ${history.artist.genres.join(", ") || "genre evidence unavailable"}.`,
        date: event.date,
        venue: event.venue!.name,
        city: event.venue!.city!,
        country: event.venue!.country!,
        eventUrl,
        promoterOrganizer: null,
        lineupStatus: lineup.status,
        lineupConfidence: lineup.confidence,
        lineupEvidence,
        publicContactRoute: null,
        supportOpportunityScore: score,
        wording: lineup.status === "lineup_uncertain"
          ? "Lineup incomplete — support availability unverified"
          : "Potential support opportunity",
        sourceTimestamps: [collectedAt]
      });
    }
  }

  opportunities.sort((left, right) => right.supportOpportunityScore - left.supportOpportunityScore || left.date.localeCompare(right.date));
  return { ...countryResolution, opportunities, rejected, warnings: [] };
}

function rejectEvent(
  event: ArtistConcert,
  artist: SimilarArtist,
  input: FindSupportSlotOpportunitiesInput,
  referenceCountry: string,
  thresholds: SupportSlotThresholds,
  now: Date
): RejectedSupportSlotEvent["reason"] | null {
  const eventDate = toDateOnlyString(event.date);
  const today = toDateOnlyString(now);
  if (event.status !== "upcoming" || !eventDate || !today || eventDate < today) return "cancelled_or_not_upcoming";
  if (event.festivalName || /\bfest(?:ival)?\b/i.test(event.name ?? "")) return "festival";
  if (!event.venue?.name || !event.venue.city || !event.venue.country || !event.date || !event.sources.some((source) => source.url)) {
    return "missing_required_event_data";
  }
  if (normalize(event.venue.country) !== normalize(referenceCountry)) return "outside_reference_country";
  const genreMatch = matchBookingGenres(input.targetArtist.genres, artist.genres, artist.reason);
  if (genreMatch.score < thresholds.minimumGenreCompatibility || genreMatch.level === "generic" || genreMatch.level === "incompatible" || genreMatch.level === "unknown") {
    return "weak_genre_match";
  }

  const candidateScale = resolveHeadlinerScale(artist, input.artistScaleByName);
  const targetScale = input.targetArtist.artistScaleScore ?? null;
  if (candidateScale !== null && targetScale !== null) {
    const gap = candidateScale - targetScale;
    if (gap < thresholds.minimumScaleGap) return "headliner_not_larger";
    if (gap > thresholds.maximumScaleGap) return "extreme_scale_mismatch";
  } else {
    if (artist.commercialTier === "major_reference") return "extreme_scale_mismatch";
    if (!isKnownLargerTier(artist.commercialTier)) return "headliner_not_larger";
  }
  return null;
}

function assessSupportLineup(event: ArtistConcert, headliner: string): { status: SupportLineupStatus; confidence: "high" | "medium" | "low" } {
  const text = `${event.name ?? ""} ${event.tourName ?? ""}`;
  const names = event.lineup?.map((entry) => entry.name).filter((name) => normalize(name) !== normalize(headliner)) ?? [];
  if (names.length > 0 && ADDITIONAL_SUPPORT_OPEN_PATTERN.test(text)) return { status: "additional_support_explicitly_open", confidence: "high" };
  if (names.length > 0) return { status: "support_announced", confidence: "high" };
  if (!event.lineup) return { status: "lineup_uncertain", confidence: "low" };
  return { status: "no_support_announced", confidence: event.sources.length >= 2 ? "high" : "medium" };
}

function resolveHeadlinerScale(artist: SimilarArtist, scores: Record<string, number> | undefined): number | null {
  const direct = Object.entries(scores ?? {}).find(([name]) => normalize(name) === normalize(artist.name))?.[1];
  if (direct !== undefined) return direct;
  return artist.commercialScore ?? null;
}

function classifyScaleFit(gap: number | null, artist: SimilarArtist, thresholds: SupportSlotThresholds): HeadlinerScaleFit {
  if (gap !== null) {
    if (gap > thresholds.maximumScaleGap) return "too_large_unrealistic";
    return gap >= thresholds.ambitiousScaleGap ? "ambitious_plausible" : "realistic_step_up";
  }
  if (artist.commercialTier === "major_reference") return "too_large_unrealistic";
  if (artist.commercialTier === "aspirational") return "ambitious_plausible";
  if (artist.commercialTier === "slightly_larger") return "realistic_step_up";
  return "unknown";
}

function isKnownLargerTier(tier: SimilarArtist["commercialTier"]): boolean {
  return tier === "slightly_larger" || tier === "aspirational" || tier === "major_reference";
}

function scoreOpportunity(input: { genre: number; scaleFit: HeadlinerScaleFit; lineupStatus: SupportLineupStatus; lineupConfidence: string; sourceCount: number; eventConfidence: number }): number {
  const scale = input.scaleFit === "realistic_step_up" ? 95 : input.scaleFit === "ambitious_plausible" ? 70 : 25;
  const lineup = input.lineupStatus === "additional_support_explicitly_open" ? 100 : input.lineupStatus === "no_support_announced" ? 85 : 40;
  const sourceConfidence = Math.min(100, Math.round(input.eventConfidence * 70) + Math.min(30, input.sourceCount * 15));
  return Math.max(0, Math.min(100, Math.round(input.genre * 0.3 + scale * 0.25 + lineup * 0.25 + 100 * 0.1 + sourceConfidence * 0.1)));
}

function clean(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
