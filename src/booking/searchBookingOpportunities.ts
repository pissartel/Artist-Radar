import { pickBestContact } from "./contactExtraction.js";
import { filterBookingTargetsForRelevance, sourcePriorityBonus, type BookingRelevanceEnv } from "./relevance.js";
import { recommendBookingAction, scoreBookingCompatibility } from "./scoring.js";
import { normalizeOpportunityTitle } from "./titleNormalization.js";
import { scoreDateProximity } from "./dateProximity.js";
import { buildMatchFactors } from "./matchFactors.js";
import { analyzeSupportSlotPotential } from "./supportSlotPotential.js";
import type {
  BookingOpportunity,
  BookingRejectedByReason,
  BookingSearchInput,
  BookingSearchResult,
  BookingSourceMetadata,
  BookingSourceType,
  BookingTarget,
  BookingTargetCategory,
  ContactCandidate,
  OpportunityInternalReview
} from "./types.js";
import {
  buildDefaultBookingSourceProviders,
  type BookingSourceProvider,
  type BookingSourceProviderResult
} from "./providers/BookingSourceProvider.js";
import { warnLog } from "../utils/logger.js";
import { toDateOnlyString } from "../utils/dateOnly.js";
import { normalizeKey, normalizeVenueName } from "../utils/venueNameNormalization.js";

export interface SearchBookingOpportunitiesOptions {
  providers?: BookingSourceProvider[];
  env?: BookingRelevanceEnv;
  now?: Date;
}

export async function searchBookingOpportunities(
  input: BookingSearchInput,
  options: SearchBookingOpportunitiesOptions = {}
): Promise<BookingSearchResult> {
  const providers = options.providers && options.providers.length > 0
    ? options.providers
    : buildDefaultBookingSourceProviders();

  const providerResults = await Promise.all(
    providers.map((provider) => runProviderSafely(provider, input))
  );
  const deduped = dedupeTargets(providerResults.flatMap((result) => result.targets.map((target) => ({
    ...target,
    sourceProvider: target.sourceProvider ?? result.sourceProvider
  }))));
  const relevance = filterBookingTargetsForRelevance(input, deduped.targets, options.env, options.now);
  const rejectedByReason: BookingRejectedByReason = {
    pastEvent: relevance.summary.rejectedOldEvents + relevance.summary.rejectedPastEvents,
    missingDate: relevance.summary.rejectedMissingDateEvents,
    genreMismatch: relevance.summary.rejectedGenreMismatchEvents,
    duplicate: deduped.duplicateCount,
    lowConfidence: relevance.summary.rejectedLowConfidenceEvents
  };
  logBookingRelevanceSummary(relevance.summary, rejectedByReason);
  const targets = relevance.targets;
  const now = options.now ?? new Date();
  const opportunities = targets
    .filter((target) => target.opportunityKind !== "historical_signal")
    .map((target) => buildOpportunity(input, target, now))
    .sort((left, right) => right.score - left.score)
    .slice(0, input.limit);

  return {
    input,
    targets,
    opportunities,
    sourcesUsed: collectSourcesUsed(targets),
    warnings: uniqueStrings([
      ...providerResults.flatMap((result) => result.warnings),
      ...relevance.summary.warnings
    ]),
    sourceMetadata: providerResults.map((result): BookingSourceMetadata => ({
      providerName: result.sourceProvider,
      sourceProvider: result.sourceProvider,
      searchedQueries: result.searchedQueries,
      targetCount: result.targets.length,
      warnings: result.warnings,
      metadata: result.metadata
    })),
    rejectedByReason
  };
}

async function runProviderSafely(
  provider: BookingSourceProvider,
  input: BookingSearchInput
): Promise<BookingSourceProviderResult> {
  try {
    return await provider.search({ input, maxResults: input.limit });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLog("booking", `Provider ${provider.providerName} failed and was skipped: ${message}`);
    return {
      targets: [],
      sourceProvider: provider.providerName,
      searchedQueries: [],
      warnings: [`${provider.providerName} failed and was skipped: ${message}.`],
      metadata: { failed: true }
    };
  }
}

function buildOpportunity(input: BookingSearchInput, target: BookingTarget, now: Date): BookingOpportunity {
  const bookingScore = scoreBookingCompatibility(input, target);
  const suggestedAction = recommendBookingAction(input, target, bookingScore);
  const bestContact = pickBestContact(target.contacts);
  const priorityBonus = sourcePriorityBonus(target);
  const dateProximity = scoreDateProximity(target.eventDate ?? null, now);
  const score = clampScore(bookingScore.total + priorityBonus + dateProximity.scoreAdjustment);
  const matchBreakdown = buildMatchFactors(input, target, bookingScore, dateProximity, score);
  const supportSlotPotential = analyzeSupportSlotPotential(target, input);
  const reason = buildOpportunityReason(target, bookingScore.reason, priorityBonus);
  const titleResult = normalizeOpportunityTitle({
    rawTitle: target.name,
    category: target.category,
    city: target.city,
    eventDate: target.eventDate ?? null,
    derivedFromSimilarArtist: target.derivedFromSimilarArtist ?? null,
    venueName: target.venueName ?? null,
    genres: target.genres
  });

  return {
    name: target.name,
    rawTitle: target.name,
    displayTitle: titleResult.displayTitle,
    summary: titleResult.summary,
    type: target.category,
    category: target.category,
    city: target.city,
    country: target.country,
    sourceUrl: target.sourceUrl,
    sourceType: target.sourceType,
    sourceProvider: target.sourceProvider ?? null,
    contact: bestContact?.value ?? null,
    contactType: bestContact?.type ?? "unknown",
    imageUrl: target.imageUrl ?? null,
    ticketUrl: target.ticketUrl ?? null,
    score,
    confidence: bookingScore.confidence,
    reason,
    warnings: bookingScore.warnings,
    fitSummary: buildFitSummary(suggestedAction),
    evidence: target.evidence,
    suggestedAction,
    eventDate: target.eventDate ?? null,
    dateRange: target.eventDateRange ?? null,
    isFutureEvent: target.isFutureEvent ?? null,
    isPastEvent: target.isPastEvent ?? null,
    dateConfidence: target.dateConfidence ?? "unclear",
    opportunityKind: target.opportunityKind ?? "actionable",
    ageMonths: target.ageMonths ?? null,
    derivedFromSimilarArtist: target.derivedFromSimilarArtist ?? null,
    target: {
      ...target,
      recommendedAction: suggestedAction
    },
    bookingScore,
    matchBreakdown,
    supportSlotPotential,
    internalReview: buildInternalReview(target, bestContact, titleResult.wasRewritten)
  };
}

function buildInternalReview(
  target: BookingTarget,
  contact: ContactCandidate | null,
  titleWasRewritten: boolean
): OpportunityInternalReview {
  const missingFields: string[] = [];
  if (!target.eventDate) missingFields.push("date");
  if (!contact) missingFields.push("contact");
  if (!target.city) missingFields.push("city");

  const confidence = clampConfidence(
    (target.confidence ?? 0.5) - missingFields.length * 0.05 - (titleWasRewritten ? 0.1 : 0)
  );
  const needsReview = missingFields.length > 0 || titleWasRewritten || (target.confidence ?? 0.5) < 0.6;

  return { needsReview, missingFields, confidence };
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(value, 1));
}

function buildOpportunityReason(target: BookingTarget, baseReason: string, priorityBonus: number): string {
  const derived = target.derivedFromSimilarArtist;
  const priorityText = priorityBonus > 0
    ? `Source priority bonus: ${priorityBonus}/100.`
    : priorityBonus < 0
      ? `Broad search source penalty: ${priorityBonus}/100.`
      : null;
  const similarArtistReasons = derived
    ? [
        `Similar artist ${derived.name} played or was referenced by this source recently.`,
        `Popularity comparison: ${derived.popularityComparison}.`,
        derived.matchedGenres.length > 0 ? `Matched genres: ${derived.matchedGenres.join(", ")}.` : null,
        target.eventDate ? `Recent event date: ${target.eventDate}.` : null
      ].filter(Boolean)
    : [];
  return [...similarArtistReasons, baseReason, priorityText].filter(Boolean).join(" ");
}

// Factual, artist-facing summary of what to do with this opportunity. Never
// repeats the display title (already shown as the heading) and never exposes
// internal classification/warning language (issue #130 review feedback) —
// warnings are instead surfaced as structured negative match factors.
function buildFitSummary(action: string): string {
  if (action === "support_slot") {
    return "This looks like a stronger fit for a support-slot pitch than a headline booking.";
  }
  if (action === "application") {
    return "This opportunity is handled through an application or open-call process.";
  }
  if (action === "booking_contact") {
    return "A public booking contact is available for direct outreach.";
  }
  return "This opportunity needs manual verification before outreach.";
}

// Venue-ish categories eligible for the cross-provider merge pass below.
// Organizations without a date (e.g. a recurring venue profile with no
// specific show) are intentionally excluded — same-date matching would be
// meaningless for them, and the sourceUrl-based pass above already
// deduplicates exact repeats.
const VENUE_DEDUPE_CATEGORIES: ReadonlySet<BookingTargetCategory> = new Set(["venue", "bar", "event", "festival"]);

function dedupeTargets(targets: BookingTarget[]): { targets: BookingTarget[]; duplicateCount: number } {
  const seen = new Set<string>();
  let duplicateCount = 0;
  const firstPass = targets.filter((target) => {
    const key = `${target.sourceUrl ?? ""}:${target.name}:${target.category}`;
    if (seen.has(key)) {
      duplicateCount += 1;
      return false;
    }
    seen.add(key);
    return true;
  });

  // Second pass: the same real-world event/venue can arrive from different
  // providers (e.g. Ticketmaster and OpenAgenda) with different sourceUrls,
  // so the pass above won't catch it. Merge only when there's a real
  // date+venue (or date+city+name) match — never on title alone, and
  // uncertain matches are kept separate (issue #189).
  const merged: BookingTarget[] = [];
  for (const target of firstPass) {
    const matchIndex = isVenueDedupeEligible(target)
      ? merged.findIndex((existing) => isVenueDedupeEligible(existing) && isSameVenueEvent(existing, target))
      : -1;

    if (matchIndex === -1) {
      merged.push(target);
      continue;
    }
    duplicateCount += 1;
    merged[matchIndex] = mergeBookingTargets(merged[matchIndex], target);
  }

  return { targets: merged, duplicateCount };
}

function isVenueDedupeEligible(target: BookingTarget): boolean {
  return VENUE_DEDUPE_CATEGORIES.has(target.category) && Boolean(toDateOnlyString(target.eventDate ?? ""));
}

function isSameVenueEvent(left: BookingTarget, right: BookingTarget): boolean {
  const leftDate = toDateOnlyString(left.eventDate ?? "");
  const rightDate = toDateOnlyString(right.eventDate ?? "");
  if (!leftDate || !rightDate || leftDate !== rightDate) {
    return false;
  }

  const leftVenue = left.venueName ? normalizeVenueName(left.venueName, left.city) : null;
  const rightVenue = right.venueName ? normalizeVenueName(right.venueName, right.city) : null;
  if (leftVenue && rightVenue) {
    return leftVenue === rightVenue;
  }

  // Neither side has usable venue-name evidence: only fall back to
  // city+event-name, otherwise two unrelated same-day events in the same
  // city would incorrectly merge.
  const leftCity = left.city ? normalizeKey(left.city) : null;
  const rightCity = right.city ? normalizeKey(right.city) : null;
  return Boolean(leftCity && rightCity && leftCity === rightCity && normalizeKey(left.name) === normalizeKey(right.name));
}

// Preserves richer data from either side rather than letting whichever
// provider happened to run first silently win; a duplicate's own source
// URL/provider is preserved as an evidence line rather than dropped, since
// BookingTarget carries a single primary sourceUrl (issue #189: "preserve
// all source URLs").
function mergeBookingTargets(existing: BookingTarget, incoming: BookingTarget): BookingTarget {
  const additionalSourceNote = incoming.sourceUrl && incoming.sourceUrl !== existing.sourceUrl
    ? `Also listed via ${incoming.sourceProvider ?? incoming.sourceType}: ${incoming.sourceUrl}`
    : null;

  return {
    ...existing,
    description: existing.description ?? incoming.description,
    genres: uniqueStrings([...existing.genres, ...incoming.genres]),
    estimatedCapacity: existing.estimatedCapacity ?? incoming.estimatedCapacity,
    estimatedArtistTier: existing.estimatedArtistTier ?? incoming.estimatedArtistTier,
    pastProgramming: uniqueStrings([...(existing.pastProgramming ?? []), ...(incoming.pastProgramming ?? [])]),
    venueName: existing.venueName ?? incoming.venueName,
    lineup: uniqueStrings([...(existing.lineup ?? []), ...(incoming.lineup ?? [])]),
    imageUrl: existing.imageUrl ?? incoming.imageUrl,
    ticketUrl: existing.ticketUrl ?? incoming.ticketUrl,
    derivedFromSimilarArtist: existing.derivedFromSimilarArtist ?? incoming.derivedFromSimilarArtist,
    contacts: [...existing.contacts, ...incoming.contacts],
    confidence: Math.min(1, Math.max(existing.confidence, incoming.confidence) + 0.05),
    evidence: uniqueStrings([...existing.evidence, ...incoming.evidence, additionalSourceNote].filter((value): value is string => Boolean(value)))
  };
}

function collectSourcesUsed(targets: BookingTarget[]): string[] {
  return uniqueStrings(targets.map((target) => target.sourceUrl).filter((url): url is string => Boolean(url)));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function logBookingRelevanceSummary(
  summary: ReturnType<typeof filterBookingTargetsForRelevance>["summary"],
  rejectedByReason: BookingRejectedByReason
): void {
  warnLog("booking", [
    "Booking relevance filters:",
    `- Similar artists considered: ${summary.similarArtistsConsidered}`,
    `- Similar artists kept for booking: ${summary.similarArtistsKept}`,
    `- Similar artist live targets found: ${summary.similarArtistLiveTargetsFound}`,
    `- Scene agenda candidates found: ${summary.sceneAgendaCandidatesFound}`,
    `- Scene agenda candidates kept after date/genre filters: ${summary.sceneAgendaCandidatesKept}`,
    `- OpenAgenda candidates found: ${summary.openAgendaCandidatesFound}`,
    `- OpenAgenda candidates kept after date/genre filters: ${summary.openAgendaCandidatesKept}`,
    `- Venue discovery candidates found: ${summary.venueDiscoveryCandidatesFound}`,
    `- Venue discovery candidates kept (no event date required): ${summary.venueDiscoveryCandidatesKept}`,
    `- Concert-history venue candidates found: ${summary.eventHistoryVenueCandidatesFound}`,
    `- Concert-history venue candidates kept (no event date required): ${summary.eventHistoryVenueCandidatesKept}`,
    `- Rejected old events: ${summary.rejectedOldEvents}`,
    `- Rejected genre-mismatch events: ${summary.rejectedGenreMismatchEvents}`,
    "Rejected candidates by reason:",
    `- Past event: ${rejectedByReason.pastEvent}`,
    `- Missing date: ${rejectedByReason.missingDate}`,
    `- Genre mismatch: ${rejectedByReason.genreMismatch}`,
    `- Duplicate: ${rejectedByReason.duplicate}`,
    `- Low confidence: ${rejectedByReason.lowConfidence}`
  ].join("\n"));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(value, 100));
}

export type { BookingSourceType };
