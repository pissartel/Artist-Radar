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
import {
  hasVerifiedTargetCountry,
  isInTargetMarket,
  normalizeTargetMarketCountry,
  resolveTargetCountry
} from "./targetCountry.js";
import {
  explainSimilarArtistVenueEligibility,
  type SimilarArtistEligibilityDiagnostic
} from "./similarArtistEligibility.js";

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

  const deferredOpenAiDiscoveryProviders = providers.filter((provider) => provider.providerName === "openai_opportunity_discovery");
  const eagerProviders = providers.filter((provider) => provider.providerName !== "openai_opportunity_discovery");
  const eagerProviderResults = await Promise.all(
    eagerProviders.map((provider) => runProviderSafely(provider, input))
  );
  const degradedDiscovery = isDiscoveryDegraded(eagerProviderResults);
  for (const provider of deferredOpenAiDiscoveryProviders) {
    provider.setDiscoveryMode?.(degradedDiscovery ? "expanded" : "standard");
  }
  const openAiDiscoveryResults = await Promise.all(
    deferredOpenAiDiscoveryProviders.map((provider) => runProviderSafely(provider, input))
  );
  const providerResults = [...eagerProviderResults, ...openAiDiscoveryResults];
  const rawProviderTargets = providerResults.flatMap((result) => result.targets.map((target) => ({
    ...target,
    sourceProvider: target.sourceProvider ?? result.sourceProvider
  })));
  const targetCountry = resolveTargetCountry(input);
  const normalizedMarketTargets = rawProviderTargets.map((target) => normalizeTargetMarketCountry(input, target, targetCountry));
  const venueLinkedMarketTargets = normalizedMarketTargets.map(ensureEventVenueOpportunityId);
  const eventDerivedVenueTargets = createVenueTargetsFromEventVenues(venueLinkedMarketTargets);
  const targetsBeforeDedupe = [...venueLinkedMarketTargets, ...eventDerivedVenueTargets];
  const deduped = dedupeTargets(targetsBeforeDedupe);
  const relevance = filterBookingTargetsForRelevance(input, deduped.targets, options.env, options.now);
  const rejectedByReason: BookingRejectedByReason = {
    pastEvent: relevance.summary.rejectedOldEvents + relevance.summary.rejectedPastEvents,
    tooSoonEvent: relevance.summary.rejectedTooSoonEvents,
    missingDate: relevance.summary.rejectedMissingDateEvents,
    genreMismatch: relevance.summary.rejectedGenreMismatchEvents,
    country: relevance.summary.rejectedCountryMismatchEvents,
    duplicate: deduped.duplicateCount,
    lowConfidence: relevance.summary.rejectedLowConfidenceEvents,
    qualityFloor: 0
  };
  logBookingRelevanceSummary(relevance.summary, rejectedByReason);
  const targets = relevance.targets;
  const now = options.now ?? new Date();
  const rankedOpportunities = targets
    .filter((target) => target.opportunityKind !== "historical_signal")
    .map((target) => buildOpportunity(input, target, now))
    .sort((left, right) => right.score - left.score);
  const qualityFloorRejectedCandidates: BookingSearchResult["diagnostics"]["qualityFloorRejectedCandidates"] = [];
  const qualityFilteredOpportunities = rankedOpportunities.filter((opportunity) => {
    const quality = shouldKeepOpportunityByQuality(input, opportunity, targetCountry);
    if (!quality.keep) {
      rejectedByReason.qualityFloor += 1;
      qualityFloorRejectedCandidates.push(buildQualityFloorRejectedCandidate(opportunity, quality.reasons));
    }
    return quality.keep;
  });
  const opportunities = combineWithCategoryQuotas(qualityFilteredOpportunities, input.limit);
  const providerDiagnostics = buildProviderDiagnostics(providerResults, targetsBeforeDedupe);
  const similarArtistEligibility = collectSimilarArtistEligibilityDiagnostics(input, providerResults);
  const venueLoss = buildVenueLossDiagnostics(providerDiagnostics, targetsBeforeDedupe, relevance.targets, rankedOpportunities, opportunities, relevance.summary);
  const diagnostics = {
    stages: {
      rawProviderTargets: rawProviderTargets.length,
      normalizedTargets: deduped.targets.length,
      venueTargetsCreated: targetsBeforeDedupe.filter((target) => target.category === "venue").length,
      eventTargetsCreated: rawProviderTargets.filter((target) => target.category === "event").length,
      rejectedBySimilarArtistEligibility: similarArtistEligibility.filter((entry) => entry.rejectedReason).length,
      rejectedByCountry: rejectedByReason.country,
      rejectedByGenre: rejectedByReason.genreMismatch,
      rejectedByDate: rejectedByReason.pastEvent + rejectedByReason.tooSoonEvent + rejectedByReason.missingDate,
      rejectedByConfidence: rejectedByReason.lowConfidence,
      deduplicatedTargets: deduped.duplicateCount,
      rankedTargets: rankedOpportunities.length,
      finalApiOpportunities: opportunities.length
    },
    providers: providerDiagnostics,
    environment: buildEnvironmentDiagnostics(process.env),
    providerAvailability: buildProviderAvailabilityDiagnostics(providerResults),
    venueLoss,
    similarArtistEligibility,
    qualityFloorRejectedCandidates,
    openAiOpportunityDiscovery: buildOpenAiOpportunityDiscoveryDiagnostics(providerResults, deduped.duplicateCount)
  };

  return {
    input,
    targets,
    opportunities,
    sourcesUsed: collectSourcesUsed(targets),
    warnings: uniqueStrings([
      ...providerResults.flatMap((result) => result.warnings),
      ...relevance.summary.warnings,
      ...(rejectedByReason.qualityFloor > 0 ? [`Booking quality floor rejected ${rejectedByReason.qualityFloor} low-quality candidates.`] : [])
    ]),
    sourceMetadata: providerResults.map((result): BookingSourceMetadata => ({
      providerName: result.sourceProvider,
      sourceProvider: result.sourceProvider,
      searchedQueries: result.searchedQueries,
      targetCount: result.targets.length,
      warnings: result.warnings,
      metadata: result.metadata
    })),
    rejectedByReason,
    diagnostics
  };
}

function createVenueTargetsFromEventVenues(targets: BookingTarget[]): BookingTarget[] {
  return targets.flatMap((target) => {
    if (!isEventLikeTarget(target.category)) return [];
    const venueName = target.venueName?.trim();
    if (!venueName || isGenericVenueName(venueName, target.city)) return [];

    const venueOpportunityId = target.venueOpportunityId ?? buildVenueOpportunityId(venueName, target.city, target.country);
    const officialVenueSourceUrl = target.sourceUrl && isVerifiedVenueSource(target) && !isLikelyEventUrl(target.sourceUrl)
      ? target.sourceUrl
      : null;
    const artistNames = uniqueStrings([
      ...(target.lineup ?? []),
      ...(target.derivedFromSimilarArtist?.name ? [target.derivedFromSimilarArtist.name] : []),
      ...(target.pastProgramming ?? [])
    ]);

    return [{
      name: venueName,
      category: "venue",
      city: target.city,
      country: target.country,
      description: target.description ?? null,
      sourceUrl: officialVenueSourceUrl,
      sourceType: officialVenueSourceUrl ? target.sourceType : "local_agenda",
      sourceProvider: target.sourceProvider ?? "event_venue_extraction",
      genres: uniqueStrings([...target.genres]),
      estimatedCapacity: target.estimatedCapacity ?? null,
      estimatedArtistTier: target.estimatedArtistTier ?? null,
      pastProgramming: uniqueStrings([
        target.name,
        ...(target.pastProgramming ?? [])
      ]),
      venueName,
      venueOpportunityId,
      lineup: [],
      imageUrl: null,
      imageSource: null,
      address: target.address ?? null,
      postalCode: target.postalCode ?? null,
      latitude: target.latitude ?? null,
      longitude: target.longitude ?? null,
      providerVenueId: target.providerVenueId ?? null,
      ticketUrl: null,
      programmingEvidence: [{
        artistName: artistNames[0] ?? target.name,
        artistNames: artistNames.length > 0 ? artistNames : undefined,
        eventName: target.name,
        eventDate: target.eventDate ?? null,
        sourceUrl: target.sourceUrl,
        genres: uniqueStrings([...target.genres])
      }],
      eventDate: null,
      eventDateRange: null,
      isFutureEvent: null,
      isPastEvent: null,
      dateConfidence: "unclear",
      opportunityKind: "prospecting_target",
      ageMonths: null,
      deadline: null,
      recommendedAction: null,
      derivedFromSimilarArtist: target.derivedFromSimilarArtist ?? null,
      venueArtistEvidence: target.venueArtistEvidence,
      contacts: [],
      confidence: Math.min(0.72, Math.max(0.56, target.confidence - (officialVenueSourceUrl ? 0.05 : 0.16))),
      evidence: uniqueStrings([
        `Venue extracted from ${target.category} source: ${target.name}.`,
        target.sourceUrl ? `Original event source kept as programming evidence: ${target.sourceUrl}` : null,
        ...target.evidence
      ].filter((value): value is string => Boolean(value)))
    } satisfies BookingTarget];
  });
}

function ensureEventVenueOpportunityId(target: BookingTarget): BookingTarget {
  if (!isEventLikeTarget(target.category) || !target.venueName?.trim()) return target;
  return {
    ...target,
    venueOpportunityId: target.venueOpportunityId ?? buildVenueOpportunityId(target.venueName, target.city, target.country)
  };
}

function isEventLikeTarget(category: BookingTargetCategory): boolean {
  return category === "event" || category === "festival" || category === "springboard" || category === "open_call";
}

function isGenericVenueName(venueName: string, city: string | null): boolean {
  const normalizedVenue = normalizeKey(venueName);
  if (!normalizedVenue) return true;
  if (city && normalizedVenue === normalizeKey(city)) return true;
  return /^(france|concert|festival|event|evenement|événement|salle|venue)$/i.test(venueName.trim());
}

function buildVenueOpportunityId(venueName: string, city: string | null, country: string | null): string {
  const slug = [venueName, city, country]
    .map((part) => normalizeKey(part ?? "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("-");
  return `venue-${slug || "unknown"}`;
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

function isDiscoveryDegraded(providerResults: BookingSourceProviderResult[]): boolean {
  return providerResults.some((result) => {
    const text = [result.sourceProvider, ...result.warnings, result.metadata.disabledReason, result.metadata.reason]
      .filter((value): value is string => typeof value === "string")
      .join(" ");
    if (/firecrawl/i.test(text) && /\b(402|quota|credits?|payment required)\b/i.test(text)) return true;
    if (/concertspunk/i.test(text) && /\b(403|blocked|bot protection|check_bot)\b/i.test(text)) return true;
    if (/tavily/i.test(result.sourceProvider) && (result.metadata.failed || result.targets.length === 0)) return true;
    return false;
  });
}

function shouldKeepOpportunityByQuality(
  input: BookingSearchInput,
  opportunity: BookingOpportunity,
  targetCountry: string | null
): { keep: boolean; reasons: string[] } {
  const outsideTargetCountry = !isInTargetMarket(input, opportunity.target, targetCountry);
  const relatedArtist = opportunity.derivedFromSimilarArtist
    ? (input.similarArtists ?? []).find((artist) => normalizeKey(artist.name) === normalizeKey(opportunity.derivedFromSimilarArtist?.name ?? ""))
    : null;
  const relatedArtistIsReference = relatedArtist?.bookingCategory === "reference";

  if (outsideTargetCountry) {
    return { keep: false, reasons: ["outside_target_country"] };
  }
  if (isValidStructuredVenue(input, opportunity, targetCountry)) {
    return { keep: true, reasons: [] };
  }
  if (opportunity.score >= 50) {
    return { keep: true, reasons: [] };
  }
  const hasCompatibleProgrammingEvidence = opportunity.bookingScore.genreFit >= 60 &&
    ((opportunity.target.programmingEvidence?.length ?? 0) > 0 || (opportunity.target.venueArtistEvidence?.length ?? 0) > 0 || (opportunity.target.pastProgramming?.length ?? 0) > 0);
  if (hasVerifiedTargetCountry(opportunity.target, targetCountry) && hasCompatibleProgrammingEvidence && !relatedArtistIsReference) {
    return { keep: true, reasons: [] };
  }
  if (opportunity.score < 50 && outsideTargetCountry && relatedArtistIsReference) {
    return { keep: false, reasons: ["low_score_out_of_country_reference"] };
  }
  const reasons = ["below_quality_floor"];
  if (opportunity.target.contacts.length === 0) reasons.push("missing_contact");
  if (opportunity.target.estimatedCapacity == null) reasons.push("missing_capacity");
  if (!opportunity.target.sourceUrl) reasons.push("missing_source_url");
  if ((opportunity.target.programmingEvidence?.length ?? 0) === 0 && (opportunity.target.venueArtistEvidence?.length ?? 0) === 0) {
    reasons.push("missing_programming_evidence");
  }
  return { keep: false, reasons };
}

function isValidStructuredVenue(
  input: BookingSearchInput,
  opportunity: BookingOpportunity,
  targetCountry: string | null
): boolean {
  const target = opportunity.target;
  if (target.category !== "venue") return false;
  if (!isInTargetMarket(input, target, targetCountry)) return false;
  const hasVenueIdentity = Boolean(target.providerVenueId || target.venueOpportunityId || target.sourceUrl);
  const hasCompatibilityEvidence = (target.programmingEvidence?.length ?? 0) > 0 ||
    (target.venueArtistEvidence?.length ?? 0) > 0 ||
    opportunity.bookingScore.genreFit >= 60;
  return hasVenueIdentity && hasCompatibilityEvidence;
}

function buildQualityFloorRejectedCandidate(opportunity: BookingOpportunity, rejectionReasons: string[]): BookingSearchResult["diagnostics"]["qualityFloorRejectedCandidates"][number] {
  return {
    name: opportunity.name,
    type: opportunity.type,
    category: opportunity.category,
    city: opportunity.city,
    country: opportunity.country,
    sourceProvider: opportunity.sourceProvider,
    score: opportunity.score,
    genreFit: opportunity.bookingScore.genreFit,
    sourceConfidence: opportunity.bookingScore.sourceConfidence,
    programmingEvidenceCount: opportunity.target.programmingEvidence?.length ?? 0,
    hasStructuredVenue: Boolean(opportunity.target.providerVenueId || opportunity.target.venueOpportunityId),
    rejectionReasons
  };
}

function combineWithCategoryQuotas(opportunities: BookingOpportunity[], limit: number): BookingOpportunity[] {
  const max = Math.max(0, limit);
  if (max === 0) return [];
  const venues = opportunities.filter((opportunity) => opportunity.category === "venue");
  const datedOpportunities = opportunities.filter((opportunity) =>
    opportunity.category === "event" ||
    opportunity.category === "festival" ||
    opportunity.category === "springboard" ||
    opportunity.category === "open_call"
  );
  const selected: BookingOpportunity[] = [];
  const seen = new Set<string>();

  const add = (items: BookingOpportunity[], count: number) => {
    for (const item of items) {
      if (selected.length >= max || count <= 0) return;
      const key = opportunityKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(item);
      count -= 1;
    }
  };

  if (max < 3) {
    add(datedOpportunities, 1);
    add(venues, max - selected.length);
    add(opportunities, max - selected.length);
    return selected;
  }

  const baseQuota = Math.max(1, Math.floor(max / 3));
  const venueQuota = Math.min(5, baseQuota, max);
  const datedQuota = Math.min(5, baseQuota, Math.max(0, max - venueQuota));

  add(venues, venueQuota);
  add(datedOpportunities, datedQuota);
  add(opportunities, max - selected.length);
  return selected;
}

function opportunityKey(opportunity: BookingOpportunity): string {
  return [
    opportunity.category,
    normalizeKey(opportunity.name),
    normalizeKey(opportunity.city ?? ""),
    normalizeKey(opportunity.country ?? ""),
    opportunity.eventDate ?? ""
  ].join("|");
}

function buildVenueLossDiagnostics(
  providerDiagnostics: ReturnType<typeof buildProviderDiagnostics>,
  rawProviderTargets: BookingTarget[],
  filteredTargets: BookingTarget[],
  rankedOpportunities: BookingOpportunity[],
  finalOpportunities: BookingOpportunity[],
  summary: ReturnType<typeof filterBookingTargetsForRelevance>["summary"]
) {
  return {
    rawTicketmasterEvents: providerDiagnostics.ticketmasterRawEvents,
    structuredTicketmasterVenuesFound: rawProviderTargets.filter((target) => target.sourceProvider === "ticketmaster" && target.category === "venue" && Boolean(target.venueName)).length,
    venueCandidatesBeforeFiltering: rawProviderTargets.filter((target) => target.category === "venue").length,
    venueCandidatesRejectedByDate: 0,
    venueCandidatesRejectedByGenre: summary.venueCandidatesRejectedByGenre,
    venueCandidatesRejectedByCountry: summary.venueRejectionSamples.filter((sample) => sample.rejectionReason === "country").length,
    venueCandidatesRejectedByConfidence: summary.venueCandidatesRejectedByConfidence,
    venueCandidatesAfterFiltering: filteredTargets.filter((target) => target.category === "venue").length,
    eventCandidatesAfterFiltering: filteredTargets.filter((target) => target.category === "event").length,
    finalVenueOpportunities: finalOpportunities.filter((opportunity) => opportunity.category === "venue").length,
    finalEventOpportunities: finalOpportunities.filter((opportunity) => opportunity.category === "event").length,
    rejectedVenueSamples: summary.venueRejectionSamples
  };
}

function buildProviderDiagnostics(
  providerResults: BookingSourceProviderResult[],
  rawProviderTargets: BookingTarget[]
) {
  const ticketmasterMetadata = providerResults
    .filter((result) => result.sourceProvider === "ticketmaster")
    .map((result) => result.metadata);
  const countMetadataNumber = (key: string): number =>
    ticketmasterMetadata.reduce((sum, metadata) => sum + (typeof metadata[key] === "number" ? metadata[key] as number : 0), 0);

  return {
    ticketmasterRawEvents: countMetadataNumber("rawEventCount"),
    ticketmasterVenueOpportunitiesCreated: rawProviderTargets.filter((target) => target.sourceProvider === "ticketmaster" && target.category === "venue").length,
    ticketmasterEventOpportunitiesCreated: rawProviderTargets.filter((target) => target.sourceProvider === "ticketmaster" && target.category === "event").length,
    similarArtistHistoryVenues: rawProviderTargets.filter((target) => target.sourceProvider === "similar_artist_event_history" && target.category === "venue").length,
    openAiWebSearchResults: rawProviderTargets.filter((target) => target.sourceProvider === "openai_web_search" || target.sourceProvider === "openai_web_search_concerts" || target.sourceProvider === "openai_opportunity_discovery").length,
    exaResults: providerResults.filter((result) => /exa/i.test(result.sourceProvider)).reduce((sum, result) => sum + result.targets.length, 0),
    openAgendaResults: rawProviderTargets.filter((target) => target.sourceType === "openagenda" || /openagenda/i.test(target.sourceProvider ?? "")).length
  };
}

function collectSimilarArtistEligibilityDiagnostics(
  input: BookingSearchInput,
  providerResults: BookingSourceProviderResult[]
): SimilarArtistEligibilityDiagnostic[] {
  const fromMetadata = providerResults.flatMap((result) => {
    const value = result.metadata.similarArtistEligibilityDiagnostics;
    return Array.isArray(value) ? value : [];
  });
  if (fromMetadata.length > 0) {
    return fromMetadata.filter((value): value is SimilarArtistEligibilityDiagnostic =>
      typeof value === "object" && value !== null && "artistName" in value
    );
  }
  return (input.similarArtists ?? []).map(explainSimilarArtistVenueEligibility);
}

function buildEnvironmentDiagnostics(env: NodeJS.ProcessEnv) {
  return {
    ticketmasterEnabled: env.ENABLE_TICKETMASTER_CONCERTS === "true" && Boolean(env.TICKETMASTER_API_KEY),
    openAiWebSearchEnabled: env.OPENAI_CONCERT_DISCOVERY_ENABLED === "true" && Boolean(env.OPENAI_API_KEY),
    tavilyEnabled: Boolean(env.TAVILY_API_KEY),
    exaEnabled: Boolean(env.EXA_API_KEY),
    firecrawlEnabled: Boolean(env.FIRECRAWL_API_KEY),
    openAgendaEnabled: env.ENABLE_OPENAGENDA === "true" && Boolean(env.OPENAGENDA_API_KEY),
    concertsPunkEnabled: env.ENABLE_SCENE_AGENDAS === "true"
  };
}

function buildProviderAvailabilityDiagnostics(providerResults: BookingSourceProviderResult[]): BookingSearchResult["diagnostics"]["providerAvailability"] {
  const providerStatus = (pattern: RegExp): "available" | "no_results" | "failed" => {
    const results = providerResults.filter((result) => pattern.test(result.sourceProvider) || pattern.test(result.metadata.searchProvider as string ?? ""));
    if (results.some((result) => result.metadata.failed)) return "failed";
    if (results.some((result) => result.targets.length > 0)) return "available";
    return "no_results";
  };
  const extractionDiagnostics = providerResults
    .map((result) => result.metadata.extractProviderDiagnostics)
    .filter((value): value is { extractionProviders?: Record<string, string> } => typeof value === "object" && value !== null);
  const extractionStatus = (name: string, fallback: string): string =>
    extractionDiagnostics.map((entry) => entry.extractionProviders?.[name]).find(Boolean) ?? fallback;
  const firecrawlQuotaExhausted = providerResults.some((result) =>
    /firecrawl/i.test(result.sourceProvider) &&
    [result.metadata.disabledReason, ...result.warnings].some((value) => typeof value === "string" && /\b(402|quota|credits?|payment required)\b/i.test(value))
  );
  const structuredStatus = (pattern: RegExp): "available" | "failed" => {
    const result = providerResults.find((entry) => pattern.test(entry.sourceProvider));
    if (!result) return "failed";
    return result.metadata.failed ? "failed" : "available";
  };

  return {
    searchProviders: {
      tavily: providerStatus(/tavily/i),
      exa: providerStatus(/exa/i),
      openAiWebSearch: providerStatus(/openai_web_search/i)
    },
    extractionProviders: {
      nativeFetch: extractionStatus("nativeFetch", "available") as "available" | "failed",
      jina: extractionStatus("jina", "available") as "available" | "failed",
      firecrawl: (firecrawlQuotaExhausted ? "quota_exhausted" : extractionStatus("firecrawl", "available")) as "available" | "quota_exhausted" | "failed",
      browser: extractionStatus("browser", "disabled") as "available" | "disabled" | "failed"
    },
    structuredProviders: {
      ticketmaster: structuredStatus(/ticketmaster/i),
      openAgenda: structuredStatus(/openagenda/i)
    }
  };
}

function buildOpenAiOpportunityDiscoveryDiagnostics(
  providerResults: BookingSourceProviderResult[],
  duplicateCount: number
): BookingSearchResult["diagnostics"]["openAiOpportunityDiscovery"] {
  const fallback: BookingSearchResult["diagnostics"]["openAiOpportunityDiscovery"] = {
    mode: "disabled",
    searches: {
      festivalQueries: 0,
      venueQueries: 0,
      similarArtistQueries: 0,
      upcomingEventQueries: 0,
      organizationQueries: 0
    },
    candidates: {
      rawOpenAiCandidates: 0,
      festivals: 0,
      venues: 0,
      events: 0,
      promoters: 0,
      associations: 0,
      mergedWithOtherProviders: 0,
      rejected: 0,
      final: 0
    },
    rejectedCandidates: []
  };
  const result = providerResults.find((entry) => entry.sourceProvider === "openai_opportunity_discovery");
  const diagnostics = result?.metadata.openAiOpportunityDiscoveryDiagnostics;
  if (!diagnostics || typeof diagnostics !== "object") return fallback;
  const value = diagnostics as BookingSearchResult["diagnostics"]["openAiOpportunityDiscovery"];
  return {
    ...fallback,
    ...value,
    searches: { ...fallback.searches, ...value.searches },
    candidates: {
      ...fallback.candidates,
      ...value.candidates,
      mergedWithOtherProviders: Math.min(duplicateCount, value.candidates.rawOpenAiCandidates)
    },
    rejectedCandidates: value.rejectedCandidates ?? []
  };
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
    venueOpportunityId: target.venueOpportunityId ?? null,
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
// one-off dated event) can be matched purely on venue identity
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
  if (isSameFestivalEdition(left, right)) {
    return true;
  }

  const leftVenue = left.venueName ? normalizeVenueName(left.venueName, left.city) : null;
  const rightVenue = right.venueName ? normalizeVenueName(right.venueName, right.city) : null;
  const leftCity = left.city ? normalizeKey(left.city) : null;
  const rightCity = right.city ? normalizeKey(right.city) : null;
  const leftCountry = left.country ? normalizeKey(left.country) : null;
  const rightCountry = right.country ? normalizeKey(right.country) : null;
  const sameCity = leftCity && rightCity ? leftCity === rightCity : !leftCity && !rightCity;
  const sameCountry = leftCountry && rightCountry ? leftCountry === rightCountry : true;
  const sameVenueIdentity = Boolean(leftVenue && rightVenue && leftVenue === rightVenue && sameCity && sameCountry);

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

function isSameFestivalEdition(left: BookingTarget, right: BookingTarget): boolean {
  if (left.category !== "festival" || right.category !== "festival") return false;
  const leftDate = toDateOnlyString(left.eventDate ?? "");
  const rightDate = toDateOnlyString(right.eventDate ?? "");
  if (!leftDate || !rightDate || !areDatesWithinDays(leftDate, rightDate, 7)) return false;

  const leftEdition = normalizeFestivalEditionTitle(left.name);
  const rightEdition = normalizeFestivalEditionTitle(right.name);
  if (!leftEdition || !rightEdition || leftEdition !== rightEdition) return false;

  const leftCountry = left.country ? normalizeKey(left.country) : null;
  const rightCountry = right.country ? normalizeKey(right.country) : null;
  if (leftCountry && rightCountry && leftCountry !== rightCountry) return false;

  const leftCity = left.city ? normalizeKey(left.city) : null;
  const rightCity = right.city ? normalizeKey(right.city) : null;
  return !leftCity || !rightCity || leftCity === rightCity;
}

function normalizeFestivalEditionTitle(value: string): string {
  return normalizeKey(value)
    .replace(/\b(le|du)?\s*\d{1,2}\s+(janvier|janv|fevrier|fevr|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)\s+20\d{2}\b/g, " ")
    .replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]20\d{2}\b/g, " ")
    .replace(/\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function areDatesWithinDays(leftIso: string, rightIso: string, days: number): boolean {
  const left = new Date(`${leftIso}T00:00:00Z`).getTime();
  const right = new Date(`${rightIso}T00:00:00Z`).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= days * 24 * 60 * 60 * 1000;
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
    venueOpportunityId: existing.venueOpportunityId ?? incoming.venueOpportunityId,
    address: existing.address ?? incoming.address,
    postalCode: existing.postalCode ?? incoming.postalCode,
    latitude: existing.latitude ?? incoming.latitude,
    longitude: existing.longitude ?? incoming.longitude,
    providerVenueId: existing.providerVenueId ?? incoming.providerVenueId,
    lineup: uniqueStrings([...(existing.lineup ?? []), ...(incoming.lineup ?? [])]),
    programmingEvidence: mergeProgrammingEvidence(existing.programmingEvidence, incoming.programmingEvidence),
    imageUrl: existing.imageUrl ?? incoming.imageUrl,
    imageSource: existing.imageSource ?? incoming.imageSource,
    ticketUrl: existing.ticketUrl ?? incoming.ticketUrl,
    eventDateRange: mergeTargetDateRange(existing, incoming),
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

function mergeProgrammingEvidence(
  left?: BookingTarget["programmingEvidence"],
  right?: BookingTarget["programmingEvidence"]
): BookingTarget["programmingEvidence"] {
  const byArtist = new Map<string, { artistName: string; genres: string[] }>();
  for (const item of [...(left ?? []), ...(right ?? [])]) {
    const key = normalizeKey(item.artistName);
    const existing = byArtist.get(key);
    byArtist.set(key, {
      artistName: existing?.artistName ?? item.artistName,
      genres: uniqueStrings([...(existing?.genres ?? []), ...item.genres])
    });
  }
  return byArtist.size > 0 ? [...byArtist.values()] : undefined;
}

function mergeTargetDateRange(
  existing: BookingTarget,
  incoming: BookingTarget
): BookingTarget["eventDateRange"] {
  const dates = [
    existing.eventDateRange?.start,
    existing.eventDateRange?.end,
    incoming.eventDateRange?.start,
    incoming.eventDateRange?.end,
    toDateOnlyString(existing.eventDate ?? ""),
    toDateOnlyString(incoming.eventDate ?? "")
  ].filter((value): value is string => Boolean(value)).sort();

  if (dates.length < 2) {
    return existing.eventDateRange ?? incoming.eventDateRange ?? null;
  }

  const start = dates[0];
  const end = dates[dates.length - 1];
  return start && end && start !== end ? { start, end } : existing.eventDateRange ?? incoming.eventDateRange ?? null;
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
    `- Rejected out-of-country candidates: ${summary.rejectedCountryMismatchEvents}`,
    `- Rejected genre-mismatch events: ${summary.rejectedGenreMismatchEvents}`,
    "Rejected candidates by reason:",
    `- Past event: ${rejectedByReason.pastEvent}`,
    `- Too soon event: ${rejectedByReason.tooSoonEvent}`,
    `- Missing date: ${rejectedByReason.missingDate}`,
    `- Country: ${rejectedByReason.country}`,
    `- Genre mismatch: ${rejectedByReason.genreMismatch}`,
    `- Duplicate: ${rejectedByReason.duplicate}`,
    `- Low confidence: ${rejectedByReason.lowConfidence}`,
    `- Quality floor: ${rejectedByReason.qualityFloor}`
  ].join("\n"));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(value, 100));
}

export type { BookingSourceType };
