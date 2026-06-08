import { pickBestContact } from "./contactExtraction.js";
import { recommendBookingAction, scoreBookingCompatibility } from "./scoring.js";
import type { BookingOpportunity, BookingSearchInput, BookingSearchResult, BookingSourceMetadata, BookingSourceType, BookingTarget } from "./types.js";
import {
  buildDefaultBookingSourceProviders,
  type BookingSourceProvider
} from "./providers/BookingSourceProvider.js";

export interface SearchBookingOpportunitiesOptions {
  providers?: BookingSourceProvider[];
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
  const targets = dedupeTargets(providerResults.flatMap((result) => result.targets));
  const opportunities = targets
    .map((target) => buildOpportunity(input, target))
    .sort((left, right) => right.score - left.score)
    .slice(0, input.limit);

  return {
    input,
    targets,
    opportunities,
    sourcesUsed: collectSourcesUsed(targets),
    warnings: uniqueStrings(providerResults.flatMap((result) => result.warnings)),
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

  return {
    name: target.name,
    type: target.category,
    category: target.category,
    city: target.city,
    country: target.country,
    sourceUrl: target.sourceUrl,
    contact: bestContact?.value ?? null,
    contactType: bestContact?.type ?? "unknown",
    score: bookingScore.total,
    confidence: bookingScore.confidence,
    reason: bookingScore.reason,
    warnings: bookingScore.warnings,
    fitSummary: buildFitSummary(target, suggestedAction, bookingScore.warnings),
    evidence: target.evidence,
    suggestedAction,
    target: {
      ...target,
      recommendedAction: suggestedAction
    },
    bookingScore
  };
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

export type { BookingSourceType };
