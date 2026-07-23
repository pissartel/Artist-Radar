import type { ConcertSourceType, ConcertVerificationStatus } from "./types.js";

const OFFICIAL_SOURCE_TYPES = new Set<ConcertSourceType>(["artist_official", "venue_official", "festival_official", "promoter_official"]);
const CREDIBLE_NON_OFFICIAL_TYPES = new Set<ConcertSourceType>(["cultural_agenda", "press"]);

export interface VerificationInput {
  sourceTypes: ConcertSourceType[];
  hasVenue: boolean;
  hasCompleteDate: boolean;
}

/**
 * Assumes date/identity/citation validity has already been checked upstream
 * (a concert with no valid source or a rejected identity never reaches this
 * function — see OpenAIWebSearchConcertProvider.ts). This only decides
 * confirmed vs probable vs unverified among concerts that are otherwise
 * eligible.
 */
export function classifyVerification({ sourceTypes, hasVenue, hasCompleteDate }: VerificationInput): ConcertVerificationStatus {
  if (!hasVenue || !hasCompleteDate || sourceTypes.length === 0) {
    return "unverified";
  }

  const hasOfficialSource = sourceTypes.some((type) => OFFICIAL_SOURCE_TYPES.has(type));
  const hasTicketingSource = sourceTypes.includes("ticketing");
  if (hasOfficialSource || hasTicketingSource) {
    return "confirmed";
  }

  const credibleNonOfficialCount = sourceTypes.filter((type) => CREDIBLE_NON_OFFICIAL_TYPES.has(type)).length;
  if (credibleNonOfficialCount >= 2) {
    // Two independent credible (non-official) sources agreeing is treated
    // the same as one official source.
    return "confirmed";
  }
  if (credibleNonOfficialCount === 1) {
    return "probable";
  }

  return "unverified";
}
