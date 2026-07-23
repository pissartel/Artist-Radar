import { toDateOnlyString } from "../../utils/dateOnly.js";

export interface ConcertDateWindows {
  pastStart: string;
  pastEnd: string;
  upcomingStart: string;
  upcomingEnd: string;
}

export function buildDateWindows(now: Date, pastMonths: number, upcomingMonths: number): ConcertDateWindows {
  const pastStart = new Date(now);
  pastStart.setMonth(pastStart.getMonth() - pastMonths);
  const pastEnd = new Date(now);
  pastEnd.setDate(pastEnd.getDate() - 1);

  const upcomingEnd = new Date(now);
  upcomingEnd.setMonth(upcomingEnd.getMonth() + upcomingMonths);

  return {
    pastStart: toDateOnlyString(pastStart) ?? toDateOnlyString(now)!,
    pastEnd: toDateOnlyString(pastEnd) ?? toDateOnlyString(now)!,
    upcomingStart: toDateOnlyString(now)!,
    upcomingEnd: toDateOnlyString(upcomingEnd) ?? toDateOnlyString(now)!
  };
}

export type ProgrammaticStatus = "past" | "upcoming" | "cancelled" | "postponed" | "unknown";

/**
 * Never trusts the model-provided status when it conflicts with the date
 * (issue spec Part 10): a cancelled/postponed status is preserved (it isn't
 * a date fact), but past-vs-upcoming is always recalculated from the actual
 * date against "now".
 */
export function classifyStatusFromDate(dateStr: string, modelStatus: string, now: Date): ProgrammaticStatus {
  if (modelStatus === "cancelled" || modelStatus === "postponed") {
    return modelStatus;
  }

  const dateOnly = toDateOnlyString(dateStr);
  const nowOnly = toDateOnlyString(now);
  if (!dateOnly || !nowOnly) {
    return "unknown";
  }

  return dateOnly >= nowOnly ? "upcoming" : "past";
}

/** True when dateStr is a valid ISO/date-only string. */
export function isValidEventDate(dateStr: string): boolean {
  return toDateOnlyString(dateStr) !== null;
}

/** True when dateStr falls within [windowStart, windowEnd] (inclusive, date-only comparison). */
export function isWithinWindow(dateStr: string, windowStart: string, windowEnd: string): boolean {
  const dateOnly = toDateOnlyString(dateStr);
  if (!dateOnly) {
    return false;
  }
  return dateOnly >= windowStart && dateOnly <= windowEnd;
}
