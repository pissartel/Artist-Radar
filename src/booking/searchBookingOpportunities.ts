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
  OpportunityInternalReview,
  VenueArtistEvidence
} from "./types.js";
import {
  buildDefaultBookingSourceProviders,
  type BookingSourceProvider,
  type BookingSourceProviderResult
} from "./providers/BookingSourceProvider.js";
import { warnLog } from "../utils/logger.js";
import { toDateOnlyString } from "../utils/dateOnly.js";
import { normalizeKey, normalizeVenueName } from "../utils/venueNameNormalization.js";
import { isLikelyEventUrl } from "./venueUrl.js";

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
const VENUE_DEDUPE_CATEGORIES: ReadonlySet<BookingTargetCategory> = new Set(["venue", "bar", "event", "festival"]);

// Recurring-organization categories (a venue or bar profile, as opposed to a
// one-off dated event/festival) can be matched purely on venue identity
// (name+city), without requiring an event date on either side. This is what
// lets a venue discovered via VenueDiscoveryBookingSourceProvider (real
// official page, no single event date — see that file) merge with the same
// venue discovered via similar-artist concert history (dated evidence, but
// whose only "source" is the similar artist's concert page) into one
// opportunity carrying the real website plus the full evidence trail (PR
// #218 review feedback: "extract the actual venue... official venue
// website... do not map the similar artist's profile/calendar URL into
// venueWebsite").
const ORGANIZATION_DEDUPE_CATEGORIES: ReadonlySet<BookingTargetCategory> = new Set(["venue", "bar"]);

// A venue's own official page is a more trustworthy website than a similar
// artist's concert-history source (their Songkick/Bandsintown/etc. page) —
// used by mergeBookingTargets to decide which sourceUrl becomes the merged
// target's primary sourceUrl/website.
const VERIFIED_VENUE_SOURCE_TYPES: ReadonlySet<BookingSourceType> = new Set([
  "venue_official_programming_page",
  "official_site"
]);

function isVerifiedVenueSource(target: BookingTarget): boolean {
  return VERIFIED_VENUE_SOURCE_TYPES.has(target.sourceType);
}

// Backend invariant: a venue opportunity's primary sourceUrl must represent
// the venue itself, never an individual event. Every producer of a
// category:"venue" BookingTarget is expected to already resolve this
// correctly (see resolveVenueOfficialUrl in venueUrl.ts), and the shared
// classifyBookingTarget funnel (classifyTarget.ts) enforces it for
// RawBookingSource-based producers — this is the final, universal
// enforcement point where every provider's targets converge regardless of
// which path produced them, so no future producer can slip past it.
function enforceVenueUrlInvariant(target: BookingTarget): BookingTarget {
  if (target.category !== "venue" || !target.sourceUrl || !isLikelyEventUrl(target.sourceUrl)) {
    return target;
  }
  return { ...target, sourceUrl: null, sourceType: "similar_artist_live_history" };
}

function dedupeTargets(targets: BookingTarget[]): { targets: BookingTarget[]; duplicateCount: number } {
  const seen = new Set<string>();
  let duplicateCount = 0;
  const firstPass = targets.map(enforceVenueUrlInvariant).filter((target) => {
    // No sourceUrl to naively key on — most commonly a venue opportunity
    // with no verified official site (the invariant above, or a producer
    // that never found one). Silently dropping same-name/same-category
    // targets here would lose each one's own evidence; let the smarter
    // second pass below (which merges venue-identity matches rather than
    // dropping them) handle any real duplicate instead.
    if (!target.sourceUrl) {
      return true;
    }
    const key = `${target.sourceUrl}:${target.name}:${target.category}`;
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
  if (ORGANIZATION_DEDUPE_CATEGORIES.has(target.category) && Boolean(target.venueName)) {
    return true;
  }
  return VENUE_DEDUPE_CATEGORIES.has(target.category) && Boolean(toDateOnlyString(target.eventDate ?? ""));
}

function isSameVenueEvent(left: BookingTarget, right: BookingTarget): boolean {
  const leftVenue = left.venueName ? normalizeVenueName(left.venueName, left.city) : null;
  const rightVenue = right.venueName ? normalizeVenueName(right.venueName, right.city) : null;
  const leftCity = left.city ? normalizeKey(left.city) : null;
  const rightCity = right.city ? normalizeKey(right.city) : null;
  const sameVenueIdentity = Boolean(leftVenue && rightVenue && leftVenue === rightVenue && leftCity === rightCity);

  // Organizations (venue/bar) can be matched purely on venue identity: a
  // venue's own official page (no single event date) must still be able to
  // merge with a dated concert-history candidate for the same place.
  if (sameVenueIdentity && ORGANIZATION_DEDUPE_CATEGORIES.has(left.category) && ORGANIZATION_DEDUPE_CATEGORIES.has(right.category)) {
    return true;
  }

  const leftDate = toDateOnlyString(left.eventDate ?? "");
  const rightDate = toDateOnlyString(right.eventDate ?? "");
  if (!leftDate || !rightDate || leftDate !== rightDate) {
    return false;
  }

  if (leftVenue && rightVenue) {
    return leftVenue === rightVenue;
  }

  // Neither side has usable venue-name evidence: only fall back to
  // city+event-name, otherwise two unrelated same-day events in the same
  // city would incorrectly merge.
  return Boolean(leftCity && rightCity && leftCity === rightCity && normalizeKey(left.name) === normalizeKey(right.name));
}

// Preserves richer data from either side rather than letting whichever
// provider happened to run first silently win; a duplicate's own source
// URL/provider is preserved as an evidence line rather than dropped, since
// BookingTarget carries a single primary sourceUrl (issue #189: "preserve
// all source URLs").
//
// A venue's own official page (isVerifiedVenueSource) always wins as the
// primary sourceUrl/website, even when it arrives second — a similar
// artist's concert-history source must never end up as the merged
// opportunity's website (PR #218 review feedback). The loser's URL is kept
// only as an evidence line, and venueArtistEvidence/address are merged
// rather than dropped, so "which similar artists played here" and venue
// facts survive the merge regardless of which candidate arrived first.
function mergeBookingTargets(existing: BookingTarget, incoming: BookingTarget): BookingTarget {
  const preferIncomingAsPrimary = isVerifiedVenueSource(incoming) && !isVerifiedVenueSource(existing);
  const primary = preferIncomingAsPrimary ? incoming : existing;
  const secondary = preferIncomingAsPrimary ? existing : incoming;
  const additionalSourceNote = secondary.sourceUrl && secondary.sourceUrl !== primary.sourceUrl
    ? `Also listed via ${secondary.sourceProvider ?? secondary.sourceType}: ${secondary.sourceUrl}`
    : null;

  return {
    ...existing,
    sourceUrl: primary.sourceUrl,
    sourceType: primary.sourceType,
    sourceProvider: primary.sourceProvider,
    description: existing.description ?? incoming.description,
    genres: uniqueStrings([...existing.genres, ...incoming.genres]),
    estimatedCapacity: existing.estimatedCapacity ?? incoming.estimatedCapacity,
    estimatedArtistTier: existing.estimatedArtistTier ?? incoming.estimatedArtistTier,
    pastProgramming: uniqueStrings([...(existing.pastProgramming ?? []), ...(incoming.pastProgramming ?? [])]),
    venueName: existing.venueName ?? incoming.venueName,
    address: existing.address ?? incoming.address,
    lineup: uniqueStrings([...(existing.lineup ?? []), ...(incoming.lineup ?? [])]),
    imageUrl: existing.imageUrl ?? incoming.imageUrl,
    imageSource: existing.imageSource ?? incoming.imageSource,
    ticketUrl: existing.ticketUrl ?? incoming.ticketUrl,
    derivedFromSimilarArtist: existing.derivedFromSimilarArtist ?? incoming.derivedFromSimilarArtist,
    contacts: [...existing.contacts, ...incoming.contacts],
    confidence: Math.min(1, Math.max(existing.confidence, incoming.confidence) + 0.05),
    venueArtistEvidence: mergeVenueArtistEvidence(existing.venueArtistEvidence, incoming.venueArtistEvidence),
    evidence: uniqueStrings([...existing.evidence, ...incoming.evidence, additionalSourceNote].filter((value): value is string => Boolean(value)))
  };
}

// One evidence record per (similar artist, source) pair — a venue found via
// both discovery paths must list every contributing similar artist exactly
// once each, not lose the ones from whichever side didn't become primary
// (PR #218 acceptance criterion: "all contributing artists are listed").
function mergeVenueArtistEvidence(
  left?: VenueArtistEvidence[],
  right?: VenueArtistEvidence[]
): VenueArtistEvidence[] | undefined {
  if (!left && !right) {
    return undefined;
  }
  const seen = new Set<string>();
  const combined: VenueArtistEvidence[] = [];
  for (const item of [...(left ?? []), ...(right ?? [])]) {
    const key = `${item.similarArtistId}:${item.sourceUrl}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    combined.push(item);
  }
  return combined;
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
