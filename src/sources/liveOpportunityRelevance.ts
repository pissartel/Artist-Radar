import { matchBookingGenres, type BookingGenreMatchLevel } from "../booking/genreMatching.js";
import { classifyConcertOpportunityQuality } from "./concertOpportunityValidation.js";
import type { ArtistTier, EstimatedArtistLevel, UnifiedOpportunity } from "../schemas.js";
import { toDateOnlyString } from "../utils/dateOnly.js";

// Explicit "the support slot is still open" signals vs. "the support slot is
// already taken" signals, mirroring the vocabulary used for the same
// distinction in the booking search pipeline (src/booking/scoring.ts).
const SUPPORT_SLOT_OPEN_PATTERN =
  /\b(support tba|support à venir|support a venir|première partie à venir|premiere partie a venir|line-?up soon|lineup soon|looking for support|open support slot|recherch\w* (?:un|une) (?:premiere|première) partie)\b/i;
const SUPPORT_SLOT_CONFIRMED_PATTERN =
  /\b(support confirmed|confirmed support|première partie confirmée|premiere partie confirmee|support confirmé|support confirme|full lineup announced|line-?up complet)\b/i;

export interface LiveOpportunityRelevanceContext {
  /** Artist's own genre(s); compared against the opportunity's genres and free text. */
  artistGenres: string[];
  artistCity?: string | null;
  artistCountry?: string | null;
  artistLatitude?: number | null;
  artistLongitude?: number | null;
  artistLevel?: EstimatedArtistLevel;
  /** Countries the artist can realistically travel to. Empty/omitted = no restriction. */
  configuredTerritories?: string[];
  /** Names of artists already identified as similar to this one, used as booking evidence. */
  similarArtistNames?: string[];
}

/** The eleven deterministic score components required by issue #129, always visible on the result for debugging. */
export interface LiveOpportunityScoreComponents {
  genreCompatibilityScore: number;
  geographicRelevanceScore: number;
  artistSizeCompatibilityScore: number;
  eventDateScore: number;
  venueCapacityScore: number;
  supportActScore: number;
  similarArtistEvidenceScore: number;
  contactAvailabilityScore: number;
  sourceReliabilityScore: number;
  dataCompletenessScore: number;
  applicationDeadlineProximityScore: number;
}

export interface LiveOpportunityRelevanceResult {
  rejected: boolean;
  /** Machine-readable rejection codes, e.g. "past_event", "strong_genre_mismatch". */
  rejectionReasons: string[];
  /** null when rejected: a rejected opportunity is never scored, so no amount of completeness can compensate. */
  score: number | null;
  components: LiveOpportunityScoreComponents | null;
  /** Human-readable explanation, score summary first followed by the most decisive factors. */
  reasons: string[];
  distanceKm: number | null;
}

export interface ScoredLiveOpportunity {
  opportunity: UnifiedOpportunity;
  relevance: LiveOpportunityRelevanceResult;
}

export type LiveOpportunitySortKey = "relevance" | "date" | "distance";

const WEIGHTS: Record<keyof LiveOpportunityScoreComponents, number> = {
  genreCompatibilityScore: 0.22,
  geographicRelevanceScore: 0.12,
  artistSizeCompatibilityScore: 0.1,
  eventDateScore: 0.08,
  venueCapacityScore: 0.06,
  supportActScore: 0.08,
  similarArtistEvidenceScore: 0.1,
  contactAvailabilityScore: 0.12,
  sourceReliabilityScore: 0.06,
  dataCompletenessScore: 0.04,
  applicationDeadlineProximityScore: 0.02
};

const LEVEL_TO_TIER: Record<EstimatedArtistLevel, ArtistTier> = {
  unknown: "unknown",
  emerging: "small",
  developing: "medium",
  established: "large"
};

const COMPLETENESS_FIELDS: Array<keyof UnifiedOpportunity> = [
  "venueName",
  "headliners",
  "lineup",
  "doorsTime",
  "ticketUrl",
  "description",
  "city",
  "country",
  "venueCapacity"
];

/**
 * Computes the deterministic relevance score for a single CONCERT/FESTIVAL
 * opportunity (issue #129). Rejection rules (past event, strong genre
 * mismatch, invalid/inaccessible source, missing essential fields, or an
 * event outside the configured territory) are applied before any scoring:
 * a rejected opportunity is never scored, so a highly complete record can
 * never compensate for one of these hard failures.
 */
export function computeLiveOpportunityRelevance(
  opportunity: UnifiedOpportunity,
  context: LiveOpportunityRelevanceContext,
  now: Date = new Date()
): LiveOpportunityRelevanceResult {
  if (opportunity.type !== "CONCERT" && opportunity.type !== "FESTIVAL") {
    throw new Error(
      `computeLiveOpportunityRelevance only applies to CONCERT or FESTIVAL opportunities, got "${opportunity.type}".`
    );
  }

  const rejectionReasons = new Set<string>();

  const quality = classifyConcertOpportunityQuality(opportunity, now);
  if (quality.status === "INVALID") {
    for (const issue of quality.issues) rejectionReasons.add(issue);
  }

  const genreMatch = matchBookingGenres(context.artistGenres, opportunity.genres, buildOpportunityText(opportunity));
  if (genreMatch.level === "incompatible") {
    rejectionReasons.add("strong_genre_mismatch");
  }

  if (context.configuredTerritories && context.configuredTerritories.length > 0 && opportunity.country) {
    const allowed = context.configuredTerritories.map(normalize);
    if (!allowed.includes(normalize(opportunity.country))) {
      rejectionReasons.add("outside_configured_territory");
    }
  }

  if (rejectionReasons.size > 0) {
    return {
      rejected: true,
      rejectionReasons: [...rejectionReasons],
      score: null,
      components: null,
      reasons: [],
      distanceKm: null
    };
  }

  const geo = scoreGeographicRelevance(opportunity, context);
  const sizeFit = scoreArtistSizeCompatibility(opportunity, context);
  const dateFit = scoreEventDateProximity(opportunity, now);
  const capacity = scoreVenueCapacity(opportunity, context);
  const supportAct = scoreSupportActOpportunity(opportunity);
  const similarArtist = scoreSimilarArtistEvidence(opportunity, context);
  const contact = scoreContactAvailability(opportunity);
  const reliability = scoreSourceReliability(opportunity);
  const completeness = scoreDataCompleteness(opportunity);
  const deadline = scoreApplicationDeadlineProximity(opportunity, now);
  const genreReason = buildGenreReason(genreMatch);

  const components: LiveOpportunityScoreComponents = {
    genreCompatibilityScore: genreMatch.score,
    geographicRelevanceScore: geo.score,
    artistSizeCompatibilityScore: sizeFit.score,
    eventDateScore: dateFit.score,
    venueCapacityScore: capacity.score,
    supportActScore: supportAct.score,
    similarArtistEvidenceScore: similarArtist.score,
    contactAvailabilityScore: contact.score,
    sourceReliabilityScore: reliability.score,
    dataCompletenessScore: completeness.score,
    applicationDeadlineProximityScore: deadline.score
  };

  const score = calculateTotalScore(components);
  const reasons = buildReasons(score, components, {
    genreCompatibilityScore: genreReason,
    geographicRelevanceScore: geo.reason,
    artistSizeCompatibilityScore: sizeFit.reason,
    eventDateScore: dateFit.reason,
    venueCapacityScore: capacity.reason,
    supportActScore: supportAct.reason,
    similarArtistEvidenceScore: similarArtist.reason,
    contactAvailabilityScore: contact.reason,
    sourceReliabilityScore: reliability.reason,
    dataCompletenessScore: completeness.reason,
    applicationDeadlineProximityScore: deadline.reason
  });

  return { rejected: false, rejectionReasons: [], score, components, reasons, distanceKm: geo.distanceKm };
}

/** Scores every CONCERT/FESTIVAL entry in the list; other opportunity types are left out (see filterConcertOpportunitiesForStandardResults for organization filtering). */
export function scoreLiveOpportunities(
  opportunities: UnifiedOpportunity[],
  context: LiveOpportunityRelevanceContext,
  now: Date = new Date()
): ScoredLiveOpportunity[] {
  return opportunities
    .filter((opportunity) => opportunity.type === "CONCERT" || opportunity.type === "FESTIVAL")
    .map((opportunity) => ({ opportunity, relevance: computeLiveOpportunityRelevance(opportunity, context, now) }));
}

/** Sorts by relevance (highest first), date (soonest first) or distance (closest first); rejected/unknown values sort last. */
export function sortScoredLiveOpportunities(
  scored: ScoredLiveOpportunity[],
  sortBy: LiveOpportunitySortKey
): ScoredLiveOpportunity[] {
  const sortable = [...scored];
  if (sortBy === "date") {
    return sortable.sort((a, b) => compareNullableAsc(
      a.opportunity.eventDate ? toDateOnlyString(a.opportunity.eventDate) : null,
      b.opportunity.eventDate ? toDateOnlyString(b.opportunity.eventDate) : null
    ));
  }
  if (sortBy === "distance") {
    return sortable.sort((a, b) => compareNullableAscNumeric(a.relevance.distanceKm, b.relevance.distanceKm));
  }
  return sortable.sort((a, b) => (b.relevance.score ?? -1) - (a.relevance.score ?? -1));
}

function scoreGeographicRelevance(
  opportunity: UnifiedOpportunity,
  context: LiveOpportunityRelevanceContext
): { score: number; reason: string; distanceKm: number | null } {
  const distanceKm = computeDistanceKm(context, opportunity);
  if (distanceKm !== null) {
    const rounded = Math.round(distanceKm);
    if (distanceKm <= 50) return { score: 95, reason: `Venue is ~${rounded} km away, in the artist's local scene.`, distanceKm };
    if (distanceKm <= 200) return { score: 80, reason: `Venue is ~${rounded} km away, a realistic regional trip.`, distanceKm };
    if (distanceKm <= 500) return { score: 60, reason: `Venue is ~${rounded} km away.`, distanceKm };
    return { score: 40, reason: `Venue is ~${rounded} km away, a long trip.`, distanceKm };
  }

  const opportunityCity = normalize(opportunity.city);
  const opportunityCountry = normalize(opportunity.country);
  const artistCity = normalize(context.artistCity);
  const artistCountry = normalize(context.artistCountry);

  if (opportunityCity && opportunityCity === artistCity) {
    return { score: 95, reason: "Opportunity is in the artist's own city.", distanceKm: null };
  }
  if (opportunityCountry && artistCountry && opportunityCountry === artistCountry) {
    return { score: 65, reason: "Opportunity is in the artist's country; exact distance unknown.", distanceKm: null };
  }
  if (!opportunityCity && !opportunityCountry) {
    return { score: 40, reason: "Opportunity location is unknown.", distanceKm: null };
  }
  return { score: 45, reason: "Opportunity is outside the artist's home country.", distanceKm: null };
}

function computeDistanceKm(context: LiveOpportunityRelevanceContext, opportunity: UnifiedOpportunity): number | null {
  const { artistLatitude, artistLongitude } = context;
  if (artistLatitude == null || artistLongitude == null || opportunity.latitude == null || opportunity.longitude == null) {
    return null;
  }
  const earthRadiusKm = 6371;
  const dLat = toRadians(opportunity.latitude - artistLatitude);
  const dLon = toRadians(opportunity.longitude - artistLongitude);
  const lat1 = toRadians(artistLatitude);
  const lat2 = toRadians(opportunity.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function scoreArtistSizeCompatibility(
  opportunity: UnifiedOpportunity,
  context: LiveOpportunityRelevanceContext
): { score: number; reason: string } {
  const sizes = opportunity.artistSizes ?? [];
  if (sizes.length === 0) {
    return { score: 50, reason: "Opportunity does not specify a target artist size." };
  }

  const artistTier = LEVEL_TO_TIER[context.artistLevel ?? "unknown"];
  if (artistTier !== "unknown" && sizes.includes(artistTier)) {
    return { score: 90, reason: `Opportunity explicitly targets ${artistTier}-tier artists, matching the artist.` };
  }
  if (sizes.includes("unknown")) {
    return { score: 55, reason: "Opportunity's target artist size is unclear." };
  }
  return { score: 30, reason: `Opportunity targets ${sizes.join("/")}-tier artists, a mismatch with the artist's tier.` };
}

function scoreEventDateProximity(opportunity: UnifiedOpportunity, now: Date): { score: number; reason: string } {
  const eventIso = opportunity.eventDate ? toDateOnlyString(opportunity.eventDate) : null;
  const todayIso = toDateOnlyString(now);
  if (!eventIso || !todayIso) {
    return { score: 40, reason: "Event date is missing or unparseable." };
  }

  const daysUntil = daysBetween(todayIso, eventIso);
  if (daysUntil < 7) return { score: 40, reason: `Event is only ${daysUntil} day(s) away, too soon to realistically arrange.` };
  if (daysUntil <= 30) return { score: 70, reason: `Event is ${daysUntil} days away, a tight but workable window.` };
  if (daysUntil <= 120) return { score: 95, reason: `Event is ${daysUntil} days away, a healthy lead time to pursue it.` };
  if (daysUntil <= 270) return { score: 80, reason: `Event is ${daysUntil} days away.` };
  return { score: 55, reason: `Event is ${daysUntil} days away, far enough out that plans may change.` };
}

function scoreVenueCapacity(
  opportunity: UnifiedOpportunity,
  context: LiveOpportunityRelevanceContext
): { score: number; reason: string } {
  const capacity = opportunity.venueCapacity ?? null;
  if (capacity === null) {
    return { score: 50, reason: "Venue capacity is unknown." };
  }

  const level = context.artistLevel ?? "unknown";
  if (level === "emerging") {
    if (capacity <= 250) return { score: 90, reason: `Venue capacity (${capacity}) fits an emerging artist.` };
    if (capacity <= 600) return { score: 60, reason: `Venue capacity (${capacity}) is on the larger side for an emerging artist.` };
    return { score: 30, reason: `Venue capacity (${capacity}) is likely too large for an emerging artist to headline.` };
  }
  if (level === "developing") {
    if (capacity <= 150) return { score: 45, reason: `Venue capacity (${capacity}) may be small for a developing artist.` };
    if (capacity <= 1000) return { score: 85, reason: `Venue capacity (${capacity}) fits a developing artist.` };
    return { score: 50, reason: `Venue capacity (${capacity}) is large for a developing artist; likely a support-slot lead.` };
  }
  if (level === "established") {
    return capacity >= 400
      ? { score: 85, reason: `Venue capacity (${capacity}) fits an established artist.` }
      : { score: 45, reason: `Venue capacity (${capacity}) is small for an established artist.` };
  }
  return { score: 55, reason: `Venue capacity (${capacity}); artist size tier is unknown.` };
}

function scoreSupportActOpportunity(opportunity: UnifiedOpportunity): { score: number; reason: string } {
  const text = buildOpportunityText(opportunity);
  const hasAnnouncedSupport = (opportunity.lineup?.length ?? 0) > (opportunity.headliners?.length ?? 0);

  if (SUPPORT_SLOT_OPEN_PATTERN.test(text)) {
    return { score: 90, reason: "Source explicitly signals an open support slot." };
  }
  if (SUPPORT_SLOT_CONFIRMED_PATTERN.test(text) || hasAnnouncedSupport) {
    return { score: 35, reason: "A support act already appears announced; the slot is likely filled." };
  }
  return { score: 60, reason: "No explicit support-act signal either way." };
}

function scoreSimilarArtistEvidence(
  opportunity: UnifiedOpportunity,
  context: LiveOpportunityRelevanceContext
): { score: number; reason: string } {
  const similarArtistNames = (context.similarArtistNames ?? []).map(normalize).filter(Boolean);
  if (similarArtistNames.length === 0) {
    return { score: 45, reason: "No similar-artist evidence was supplied for comparison." };
  }

  const lineupText = normalize([...(opportunity.headliners ?? []), ...(opportunity.lineup ?? [])].join(" "));
  const matched = similarArtistNames.filter((name) => lineupText.includes(name));
  if (matched.length > 0) {
    return { score: 90, reason: `Lineup includes similar artist(s) already identified: ${matched.join(", ")}.` };
  }
  return { score: 40, reason: "None of the artist's known similar artists appear on this lineup." };
}

function scoreContactAvailability(opportunity: UnifiedOpportunity): { score: number; reason: string } {
  if (opportunity.contactEmail) {
    return { score: 90, reason: "A direct booking email is available." };
  }
  if (opportunity.contactFormUrl) {
    return { score: 75, reason: "A contact form is available." };
  }
  if (opportunity.applicationDeadline) {
    return { score: 65, reason: "An application route exists via the announced deadline." };
  }
  return { score: 15, reason: "No actionable path: no booking contact and no application route." };
}

function scoreSourceReliability(opportunity: UnifiedOpportunity): { score: number; reason: string } {
  if (typeof opportunity.confidenceScore === "number") {
    const score = clampScore(Math.round(opportunity.confidenceScore * 100));
    return { score, reason: `Source confidence recorded at ${score}/100.` };
  }
  return { score: 50, reason: "Source confidence was not recorded; treated as neutral." };
}

function scoreDataCompleteness(opportunity: UnifiedOpportunity): { score: number; reason: string } {
  const totalFields = COMPLETENESS_FIELDS.length + 1; // +1 for genres, checked separately below
  let presentCount = opportunity.genres.length > 0 ? 1 : 0;
  for (const field of COMPLETENESS_FIELDS) {
    if (isProvided(opportunity[field])) presentCount += 1;
  }
  const score = clampScore(Math.round((presentCount / totalFields) * 100));
  return { score, reason: `${presentCount}/${totalFields} optional evidence fields are populated.` };
}

function scoreApplicationDeadlineProximity(opportunity: UnifiedOpportunity, now: Date): { score: number; reason: string } {
  if (!opportunity.applicationDeadline) {
    return { score: 50, reason: "No application deadline; not an open call." };
  }

  const deadlineIso = toDateOnlyString(opportunity.applicationDeadline);
  const todayIso = toDateOnlyString(now);
  if (!deadlineIso || !todayIso) {
    return { score: 45, reason: "Application deadline could not be parsed." };
  }

  const daysUntil = daysBetween(todayIso, deadlineIso);
  if (daysUntil < 0) return { score: 15, reason: "Application deadline has already passed." };
  if (daysUntil <= 3) return { score: 55, reason: `Application deadline is in ${daysUntil} day(s); urgent.` };
  if (daysUntil <= 30) return { score: 90, reason: `Application deadline is in ${daysUntil} days, a comfortable window to apply.` };
  if (daysUntil <= 90) return { score: 75, reason: `Application deadline is in ${daysUntil} days.` };
  return { score: 60, reason: `Application deadline is far out (${daysUntil} days).` };
}

function buildGenreReason(genreMatch: { level: BookingGenreMatchLevel; score: number; matchedGenres: string[] }): string {
  const matched = genreMatch.matchedGenres.length > 0 ? ` via ${genreMatch.matchedGenres.join(", ")}` : "";
  return `Genre compatibility is ${genreMatch.level} (${genreMatch.score}/100)${matched}.`;
}

function calculateTotalScore(components: LiveOpportunityScoreComponents): number {
  const total = (Object.keys(WEIGHTS) as (keyof LiveOpportunityScoreComponents)[]).reduce(
    (sum, key) => sum + components[key] * WEIGHTS[key],
    0
  );
  return clampScore(Math.round(total));
}

function buildReasons(
  score: number,
  components: LiveOpportunityScoreComponents,
  reasonTexts: Record<keyof LiveOpportunityScoreComponents, string>
): string[] {
  const ranked = (Object.keys(WEIGHTS) as (keyof LiveOpportunityScoreComponents)[])
    .map((key) => ({ key, weightedDeviation: Math.abs(components[key] - 50) * WEIGHTS[key], text: reasonTexts[key] }))
    .sort((a, b) => b.weightedDeviation - a.weightedDeviation)
    .slice(0, 5)
    .map((entry) => entry.text);

  return [`Live-opportunity relevance score: ${score}/100.`, ...ranked];
}

function buildOpportunityText(opportunity: UnifiedOpportunity): string {
  return [opportunity.name, opportunity.description, ...(opportunity.headliners ?? []), ...(opportunity.lineup ?? [])]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function daysBetween(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(`${fromIso}T00:00:00Z`);
  const toMs = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

function compareNullableAsc(a: string | null, b: string | null): number {
  if (a && b) return a.localeCompare(b);
  if (a) return -1;
  if (b) return 1;
  return 0;
}

function compareNullableAscNumeric(a: number | null, b: number | null): number {
  if (a !== null && b !== null) return a - b;
  if (a !== null) return -1;
  if (b !== null) return 1;
  return 0;
}

function isProvided(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}
