import { pickBestContact } from "./contactExtraction.js";
import { filterBookingTargetsForRelevance, sourcePriorityBonus, type BookingRelevanceEnv } from "./relevance.js";
import { recommendBookingAction, scoreBookingCompatibility } from "./scoring.js";
import type { BookingOpportunity, BookingSearchInput, BookingSearchResult, BookingSourceMetadata, BookingSourceType, BookingTarget } from "./types.js";
import {
  buildDefaultBookingSourceProviders,
  type BookingSourceProvider
} from "./providers/BookingSourceProvider.js";
import { warnLog } from "../utils/logger.js";

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
    providers.map((provider) => provider.search({ input, maxResults: input.limit }))
  );
  const rawTargets = dedupeTargets(providerResults.flatMap((result) => result.targets.map((target) => ({
    ...target,
    sourceProvider: target.sourceProvider ?? result.sourceProvider
  }))));
  const relevance = filterBookingTargetsForRelevance(input, rawTargets, options.env, options.now);
  logBookingRelevanceSummary(relevance.summary);
  const targets = relevance.targets;
  const opportunities = targets
    .map((target) => buildOpportunity(input, target))
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
    }))
  };
}

function buildOpportunity(input: BookingSearchInput, target: BookingTarget): BookingOpportunity {
  const bookingScore = scoreBookingCompatibility(input, target);
  const suggestedAction = recommendBookingAction(input, target, bookingScore);
  const bestContact = pickBestContact(target.contacts);
  const priorityBonus = sourcePriorityBonus(target);
  const score = clampScore(bookingScore.total + priorityBonus);
  const reason = buildOpportunityReason(target, bookingScore.reason, priorityBonus);

  return {
    name: target.name,
    type: target.category,
    category: target.category,
    city: target.city,
    country: target.country,
    sourceUrl: target.sourceUrl,
    sourceType: target.sourceType,
    sourceProvider: target.sourceProvider ?? null,
    contact: bestContact?.value ?? null,
    contactType: bestContact?.type ?? "unknown",
    score,
    confidence: bookingScore.confidence,
    reason,
    warnings: bookingScore.warnings,
    fitSummary: buildFitSummary(target, suggestedAction, bookingScore.warnings),
    evidence: target.evidence,
    suggestedAction,
    eventDate: target.eventDate ?? null,
    isFutureEvent: target.isFutureEvent ?? null,
    ageMonths: target.ageMonths ?? null,
    derivedFromSimilarArtist: target.derivedFromSimilarArtist ?? null,
    target: {
      ...target,
      recommendedAction: suggestedAction
    },
    bookingScore
  };
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

function buildFitSummary(target: BookingTarget, action: string, warnings: string[]): string {
  const warningSuffix = warnings.length > 0 ? " Review warnings before outreach." : "";
  if (action === "support_slot") {
    return `${target.name} looks more realistic as a support-slot lead than a confirmed headline opportunity.${warningSuffix}`;
  }
  if (action === "application") {
    return `${target.name} should be handled as an application or open-call opportunity.${warningSuffix}`;
  }
  if (action === "booking_contact") {
    return `${target.name} has a public booking/contact signal and should be reviewed manually.${warningSuffix}`;
  }
  return `${target.name} needs more verification before outreach.${warningSuffix}`;
}

function dedupeTargets(targets: BookingTarget[]): BookingTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.sourceUrl ?? ""}:${target.name}:${target.category}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function collectSourcesUsed(targets: BookingTarget[]): string[] {
  return uniqueStrings(targets.map((target) => target.sourceUrl).filter((url): url is string => Boolean(url)));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function logBookingRelevanceSummary(summary: ReturnType<typeof filterBookingTargetsForRelevance>["summary"]): void {
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
    `- Rejected genre-mismatch events: ${summary.rejectedGenreMismatchEvents}`
  ].join("\n"));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(value, 100));
}

export type { BookingSourceType };
