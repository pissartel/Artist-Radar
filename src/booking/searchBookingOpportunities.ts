import { pickBestContact } from "./contactExtraction.js";
import { filterBookingTargetsForRelevance, sourcePriorityBonus, type BookingRelevanceEnv } from "./relevance.js";
import { recommendBookingAction, scoreBookingCompatibility } from "./scoring.js";
import { normalizeOpportunityTitle } from "./titleNormalization.js";
import { scoreDateProximity } from "./dateProximity.js";
import { buildMatchFactors } from "./matchFactors.js";
import { analyzeSupportSlotPotential } from "./supportSlotPotential.js";
import { enrichOpportunity } from "../enrichment/enrichOpportunity.js";
import { buildDefaultWebExtractProvider, getEnabledBookingSearchProviders } from "../providers/web/providers.js";
import type { WebExtractProvider } from "../providers/web/WebExtractProvider.js";
import type { WebSearchProvider } from "../providers/web/WebSearchProvider.js";
import type {
  BookingOpportunity,
  BookingRejectedByReason,
  BookingSearchInput,
  BookingSearchResult,
  BookingSourceMetadata,
  BookingSourceType,
  BookingTarget,
  ContactCandidate,
  OpportunityInternalReview
} from "./types.js";
import {
  buildDefaultBookingSourceProviders,
  type BookingSourceProvider,
  type BookingSourceProviderResult
} from "./providers/BookingSourceProvider.js";
import { warnLog } from "../utils/logger.js";

export interface ContactEnrichmentProviders {
  webExtractProvider?: WebExtractProvider | null;
  webSearchProvider?: WebSearchProvider | null;
}

export interface SearchBookingOpportunitiesOptions {
  providers?: BookingSourceProvider[];
  env?: BookingRelevanceEnv;
  now?: Date;
  /**
   * Organizer/promoter/ticketing contact enrichment (issue #159). Pass
   * explicit providers to enable it, `null` to force-disable, or omit to
   * fall back to `ENABLE_CONTACT_ENRICHMENT` env-based defaults.
   */
  contactEnrichment?: ContactEnrichmentProviders | null;
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

  const contactEnrichmentProviders = resolveContactEnrichmentProviders(options.contactEnrichment);
  if (contactEnrichmentProviders) {
    // Enrichment only ever runs against the final, already-scored opportunity
    // list (a "valid base event"), and never removes an opportunity: a
    // failure here is caught and logged, leaving `contactEnrichment: null`.
    await Promise.all(
      opportunities.map((opportunity) => attachContactEnrichment(opportunity, contactEnrichmentProviders))
    );
  }

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
    internalReview: buildInternalReview(target, bestContact, titleResult.wasRewritten),
    contactEnrichment: null
  };
}

function resolveContactEnrichmentProviders(
  explicit: ContactEnrichmentProviders | null | undefined
): ContactEnrichmentProviders | null {
  if (explicit !== undefined) {
    return explicit;
  }
  if (process.env.ENABLE_CONTACT_ENRICHMENT !== "true") {
    return null;
  }
  return {
    webExtractProvider: buildDefaultWebExtractProvider(process.env),
    webSearchProvider: getEnabledBookingSearchProviders(process.env)[0] ?? null
  };
}

async function attachContactEnrichment(
  opportunity: BookingOpportunity,
  providers: ContactEnrichmentProviders
): Promise<void> {
  try {
    opportunity.contactEnrichment = await enrichOpportunity(
      {
        name: opportunity.name,
        sourceUrl: opportunity.sourceUrl,
        sourceType: opportunity.sourceType,
        contacts: opportunity.target.contacts,
        eventDate: opportunity.eventDate,
        venueName: opportunity.target.venueName ?? null,
        city: opportunity.city,
        headliners: opportunity.target.lineup ?? []
      },
      providers
    );
  } catch (error) {
    warnLog(
      "booking",
      `Contact enrichment failed for "${opportunity.name}" and was skipped: ${error instanceof Error ? error.message : String(error)}`
    );
  }
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

function dedupeTargets(targets: BookingTarget[]): { targets: BookingTarget[]; duplicateCount: number } {
  const seen = new Set<string>();
  let duplicateCount = 0;
  const deduped = targets.filter((target) => {
    const key = `${target.sourceUrl ?? ""}:${target.name}:${target.category}`;
    if (seen.has(key)) {
      duplicateCount += 1;
      return false;
    }
    seen.add(key);
    return true;
  });
  return { targets: deduped, duplicateCount };
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
