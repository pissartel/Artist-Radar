import type { ActivityEvidence } from "./types.js";

// Evidence kinds that qualify on their own, with a single occurrence.
const SINGLE_OCCURRENCE_QUALIFYING_KINDS = new Set<ActivityEvidence["kind"]>([
  "recent_event",
  "current_programme_page",
  "explicit_live_music_activity",
  "organizes_concerts_confirmation"
]);

// A single past show is not enough on its own; the issue explicitly requires
// *multiple* historical music events as one of the qualifying signals.
const MINIMUM_HISTORICAL_EVENTS_REQUIRED = 2;

/**
 * A structure is not an active concert opportunity solely because it appears
 * in a directory (acceptance criterion). This gate requires at least one
 * qualifying activity evidence record before a candidate can be surfaced.
 */
export function hasQualifyingActivityEvidence(activityEvidence: ActivityEvidence[]): boolean {
  const historicalEventCount = activityEvidence.filter((evidence) => evidence.kind === "historical_music_event").length;
  if (historicalEventCount >= MINIMUM_HISTORICAL_EVENTS_REQUIRED) {
    return true;
  }
  return activityEvidence.some((evidence) => SINGLE_OCCURRENCE_QUALIFYING_KINDS.has(evidence.kind));
}

export interface LiveMusicEntityLike {
  activityEvidence: ActivityEvidence[];
}

export function qualifyLiveMusicEntityCandidates<T extends LiveMusicEntityLike>(
  candidates: T[]
): { qualified: T[]; rejected: T[] } {
  const qualified: T[] = [];
  const rejected: T[] = [];
  for (const candidate of candidates) {
    if (hasQualifyingActivityEvidence(candidate.activityEvidence)) {
      qualified.push(candidate);
    } else {
      rejected.push(candidate);
    }
  }
  return { qualified, rejected };
}
