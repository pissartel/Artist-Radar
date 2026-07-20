import { toDateOnlyString } from "../utils/dateOnly.js";
import type { MatchFactor } from "./matchFactors.js";

// Centralized event-date-proximity penalty (issue #130 review feedback):
// events happening very soon leave an artist too little time to realistically
// arrange outreach, so they should score lower than an identical opportunity
// further out. Thresholds are explicit and testable against an injected `now`.
export const DATE_PROXIMITY_THRESHOLDS = {
  /** 0-6 days away: strong penalty. */
  strongPenaltyMaxDays: 6,
  /** 7-13 days away: meaningful penalty. */
  meaningfulPenaltyMaxDays: 13,
  /** 14-29 days away: small penalty. 30+ days: no penalty. */
  smallPenaltyMaxDays: 29
} as const;

const STRONG_PENALTY = -20;
const MEANINGFUL_PENALTY = -10;
const SMALL_PENALTY = -4;
const PAST_EVENT_PENALTY = -25;

export interface DateProximityResult {
  /** Negative score adjustment to apply on top of the base compatibility score; 0 when not penalized. */
  scoreAdjustment: number;
  /** Null when the event date is missing/unparseable, or far enough out that there's nothing to flag. */
  factor: MatchFactor | null;
}

/** Scores date proximity against `now` (injectable for deterministic tests). Never fabricates a factor when the date is missing. */
export function scoreDateProximity(eventDate: string | null | undefined, now: Date = new Date()): DateProximityResult {
  const eventIso = eventDate ? toDateOnlyString(eventDate) : null;
  const todayIso = toDateOnlyString(now);
  if (!eventIso || !todayIso) {
    return { scoreAdjustment: 0, factor: null };
  }

  const daysUntil = daysBetween(todayIso, eventIso);

  if (daysUntil < 0) {
    return {
      scoreAdjustment: PAST_EVENT_PENALTY,
      factor: {
        code: "date_lead_time",
        label: "Event date has already passed",
        detail: "This event date is in the past.",
        impact: "negative"
      }
    };
  }

  if (daysUntil <= DATE_PROXIMITY_THRESHOLDS.strongPenaltyMaxDays) {
    return {
      scoreAdjustment: STRONG_PENALTY,
      factor: {
        code: "date_lead_time",
        label: "Event is happening very soon",
        detail: daysUntil === 0 ? "Event is happening today." : `Event is less than one week away (${daysUntil} day(s)).`,
        impact: "negative"
      }
    };
  }

  if (daysUntil <= DATE_PROXIMITY_THRESHOLDS.meaningfulPenaltyMaxDays) {
    return {
      scoreAdjustment: MEANINGFUL_PENALTY,
      factor: {
        code: "date_lead_time",
        label: "Event is happening soon",
        detail: `Event is happening in ${daysUntil} days.`,
        impact: "negative"
      }
    };
  }

  if (daysUntil <= DATE_PROXIMITY_THRESHOLDS.smallPenaltyMaxDays) {
    return {
      scoreAdjustment: SMALL_PENALTY,
      factor: {
        code: "date_lead_time",
        label: "Event date leaves a tight window",
        detail: `Event is happening in ${daysUntil} days, a tight but workable window.`,
        impact: "negative"
      }
    };
  }

  return {
    scoreAdjustment: 0,
    factor: {
      code: "date_lead_time",
      label: "Enough time to contact the organizer",
      detail: `Event is ${daysUntil} days away, a healthy lead time for outreach.`,
      impact: "positive"
    }
  };
}

function daysBetween(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(`${fromIso}T00:00:00Z`);
  const toMs = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24));
}
