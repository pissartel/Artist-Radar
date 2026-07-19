import type { EventQualityStatus, UnifiedOpportunity } from "../schemas.js";
import { toDateOnlyString } from "../utils/dateOnly.js";

// Editorial/listing pages a scraper can mistake for a single concert: agenda
// indexes, legal boilerplate, search/contact pages, etc. Matched against the
// opportunity name, never against free-form body text (issue #128).
const GENERIC_EDITORIAL_PAGE_PATTERN =
  /\b(agenda complet|toute l'actualite|toutes les actualites|actualites|archives|newsletter|mentions legales|politique de confidentialite|plan du site|nous contacter|a propos|calendrier complet|liste des evenements)\b/i;

// Issues that make an opportunity fail its core requirements outright
// (date, venue/location, source evidence, or the page not being a real
// event page). None of these have a documented exception.
const HARD_REJECT_ISSUES = new Set([
  "missing_source_evidence",
  "generic_editorial_page",
  "missing_date",
  "past_event",
  "missing_location"
]);

export interface ConcertQualityClassification {
  status: EventQualityStatus;
  issues: string[];
}

/**
 * Classifies a CONCERT or FESTIVAL opportunity as COMPLETE, PARTIAL or
 * INVALID per issue #128. FESTIVAL opportunities may temporarily have an
 * incomplete lineup; a CONCERT with an application deadline but no
 * announced headliner is treated as an open call. Both exceptions downgrade
 * to PARTIAL rather than INVALID.
 */
export function classifyConcertOpportunityQuality(
  opportunity: UnifiedOpportunity,
  now: Date = new Date()
): ConcertQualityClassification {
  if (opportunity.type !== "CONCERT" && opportunity.type !== "FESTIVAL") {
    throw new Error(
      `classifyConcertOpportunityQuality only applies to CONCERT or FESTIVAL opportunities, got "${opportunity.type}".`
    );
  }

  const issues: string[] = [];

  if (!opportunity.sourceUrl) {
    issues.push("missing_source_evidence");
  }
  if (isGenericEditorialPage(opportunity)) {
    issues.push("generic_editorial_page");
  }

  const dateStatus = classifyEventDateOnly(opportunity.eventDate ?? null, now);
  if (dateStatus === "missing") issues.push("missing_date");
  if (dateStatus === "past") issues.push("past_event");

  const hasVenue = Boolean(opportunity.venueName?.trim());
  const hasCity = Boolean(opportunity.city?.trim());
  if (!hasVenue && !hasCity) {
    issues.push("missing_location");
  }

  if (issues.some((issue) => HARD_REJECT_ISSUES.has(issue))) {
    return { status: "INVALID", issues };
  }

  const hasHeadliner = (opportunity.headliners?.length ?? 0) > 0;
  const hasDeadline = Boolean(opportunity.applicationDeadline?.trim());
  const isFestival = opportunity.type === "FESTIVAL";

  if (!hasHeadliner) {
    if (isFestival) {
      issues.push("incomplete_lineup");
    } else if (hasDeadline) {
      issues.push("open_call_pending_lineup");
    } else {
      issues.push("missing_headliner");
    }
  }
  if (!hasVenue) issues.push("missing_venue_name");
  if (!hasCity) issues.push("missing_city");

  return { status: issues.length > 0 ? "PARTIAL" : "COMPLETE", issues };
}

/** Attaches qualityStatus/qualityIssues to every CONCERT/FESTIVAL opportunity in the list. */
export function validateConcertOpportunities(
  opportunities: UnifiedOpportunity[],
  now: Date = new Date()
): UnifiedOpportunity[] {
  return opportunities.map((opportunity) => {
    if (opportunity.type !== "CONCERT" && opportunity.type !== "FESTIVAL") {
      return opportunity;
    }
    const classification = classifyConcertOpportunityQuality(opportunity, now);
    return { ...opportunity, qualityStatus: classification.status, qualityIssues: classification.issues };
  });
}

/**
 * Standard-results view: drops INVALID opportunities (including past
 * events) so only COMPLETE and PARTIAL opportunities are ever displayed,
 * and PARTIAL ones stay distinguishable via qualityStatus rather than
 * appearing as fully qualified opportunities.
 */
export function filterConcertOpportunitiesForStandardResults(
  opportunities: UnifiedOpportunity[]
): UnifiedOpportunity[] {
  return opportunities.filter((opportunity) => {
    if (opportunity.type !== "CONCERT" && opportunity.type !== "FESTIVAL") {
      return true;
    }
    return opportunity.qualityStatus !== "INVALID";
  });
}

export interface MergeConcertOpportunitiesResult {
  merged: UnifiedOpportunity[];
  duplicatesMerged: number;
}

/**
 * Merges duplicate listings of the same event sourced from different
 * providers (issue #128 acceptance criteria). Duplicates are grouped by
 * normalized name + event date + venue/city, keeping the highest-confidence
 * record's fields and filling gaps from the others, while preserving every
 * contributing source URL for evidence traceability.
 */
export function mergeDuplicateConcertOpportunities(
  opportunities: UnifiedOpportunity[]
): MergeConcertOpportunitiesResult {
  const groups = new Map<string, UnifiedOpportunity[]>();
  const passthrough: UnifiedOpportunity[] = [];

  for (const opportunity of opportunities) {
    if (opportunity.type !== "CONCERT" && opportunity.type !== "FESTIVAL") {
      passthrough.push(opportunity);
      continue;
    }
    const key = concertDedupeKey(opportunity);
    const group = groups.get(key);
    if (group) {
      group.push(opportunity);
    } else {
      groups.set(key, [opportunity]);
    }
  }

  let duplicatesMerged = 0;
  const merged: UnifiedOpportunity[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    duplicatesMerged += group.length - 1;
    merged.push(mergeConcertGroup(group));
  }

  return { merged: [...passthrough, ...merged], duplicatesMerged };
}

function mergeConcertGroup(group: UnifiedOpportunity[]): UnifiedOpportunity {
  const ranked = [...group].sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0));
  const primary = ranked[0];
  const others = ranked.slice(1);

  const sourceUrls = new Set<string>(primary.mergedSourceUrls ?? []);
  for (const record of group) {
    if (record.sourceUrl) sourceUrls.add(record.sourceUrl);
    for (const url of record.mergedSourceUrls ?? []) sourceUrls.add(url);
  }
  if (primary.sourceUrl) sourceUrls.delete(primary.sourceUrl);

  return {
    ...primary,
    venueName: primary.venueName ?? firstNonNull(others.map((record) => record.venueName)),
    city: primary.city ?? firstNonNull(others.map((record) => record.city)),
    country: primary.country ?? firstNonNull(others.map((record) => record.country)),
    headliners: nonEmptyOrUndefined(primary.headliners) ?? firstNonEmpty(others.map((record) => record.headliners)),
    lineup: nonEmptyOrUndefined(primary.lineup) ?? firstNonEmpty(others.map((record) => record.lineup)),
    ticketUrl: primary.ticketUrl ?? firstNonNull(others.map((record) => record.ticketUrl)),
    applicationDeadline: primary.applicationDeadline ?? firstNonNull(others.map((record) => record.applicationDeadline)),
    mergedSourceUrls: sourceUrls.size > 0 ? [...sourceUrls] : undefined
  };
}

function concertDedupeKey(opportunity: UnifiedOpportunity): string {
  return [
    normalizeForDedupe(opportunity.name),
    opportunity.eventDate ? toDateOnlyString(opportunity.eventDate) ?? "" : "",
    normalizeForDedupe(opportunity.venueName ?? opportunity.city ?? "")
  ].join("|");
}

function normalizeForDedupe(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isGenericEditorialPage(opportunity: UnifiedOpportunity): boolean {
  return GENERIC_EDITORIAL_PAGE_PATTERN.test(opportunity.name);
}

function classifyEventDateOnly(eventDate: string | null, now: Date): "future" | "past" | "missing" {
  const todayIso = toDateOnlyString(now);
  const eventIso = eventDate ? toDateOnlyString(eventDate) : null;
  if (!eventIso || !todayIso) return "missing";
  return eventIso >= todayIso ? "future" : "past";
}

function firstNonNull<T>(values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function firstNonEmpty<T>(values: Array<T[] | null | undefined>): T[] | undefined {
  for (const value of values) {
    if (value && value.length > 0) return value;
  }
  return undefined;
}

function nonEmptyOrUndefined<T>(value: T[] | null | undefined): T[] | undefined {
  return value && value.length > 0 ? value : undefined;
}
