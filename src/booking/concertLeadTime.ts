import { toDateOnlyString } from "../utils/dateOnly.js";

export const MIN_CONCERT_LEAD_TIME_DAYS = 30;

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function isEligibleConcertLeadTime(eventDate: string | null | undefined, now: Date = new Date()): boolean {
  const eventIso = toDateOnlyString(eventDate ?? "");
  if (!eventIso) return false;
  const eventStart = new Date(`${eventIso}T00:00:00Z`);
  return eventStart.getTime() >= addDays(now, MIN_CONCERT_LEAD_TIME_DAYS).getTime();
}
