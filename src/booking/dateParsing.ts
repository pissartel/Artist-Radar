// Shared event-date extraction for booking sources. French agendas commonly use
// formats plain ISO/European regexes miss: day-only "12/06", and written-out
// dates like "vendredi 12 juin" or "sam. 14 sept." (optional weekday prefix,
// abbreviated or accented month names, optional year).

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1,
  janv: 1,
  fevrier: 2,
  fevr: 2,
  fev: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  aout: 8,
  septembre: 9,
  sept: 9,
  sep: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12
};

const ISO_DATE_PATTERN = /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/;
const EUROPEAN_DATE_PATTERN = /\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/;
const SHORT_YEAR_EUROPEAN_DATE_PATTERN = /\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](\d{2})\b/;
const FRENCH_WRITTEN_DATE_PATTERN = /\b(\d{1,2})(?:er)?\s+([a-z]+)\.?(?:\s+(\d{4}))?\b/g;
const SHORT_EUROPEAN_DATE_PATTERN = /\b(0?[1-9]|[12]\d|3[01])[/.](0?[1-9]|1[0-2])\b(?!\d)/;
const FRENCH_WRITTEN_DATE_RANGE_PATTERN =
  /\b(\d{1,2})(?:er)?\s*(?:au|-|–|to)\s*(\d{1,2})(?:er)?\s+([a-z]+)\.?(?:\s+(\d{4}))?\b/;

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function resolveYearlessDate(month: number, day: number, referenceDate: Date): string | null {
  const refYear = referenceDate.getUTCFullYear();
  const startOfRefDay = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate()
  );
  const candidateThisYear = Date.UTC(refYear, month - 1, day);
  const year = candidateThisYear < startOfRefDay ? refYear + 1 : refYear;
  return toIsoDate(year, month, day);
}

/**
 * Extracts an event date (YYYY-MM-DD) from free-form agenda text. Tries, in order:
 * ISO (2026-06-12), European with year (12/06/2026), French written dates with
 * optional weekday prefix and optional year ("vendredi 12 juin", "sam. 14 sept. 2026"),
 * then European day/month without a year (12/06) — the year is inferred from
 * `referenceDate`, rolling forward a year if the date has already passed.
 */
export function extractEventDate(text: string, referenceDate: Date = new Date()): string | null {
  const iso = text.match(ISO_DATE_PATTERN);
  if (iso) {
    const isoDate = toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (isoDate) return isoDate;
  }

  const european = text.match(EUROPEAN_DATE_PATTERN);
  if (european) {
    const europeanDate = toIsoDate(Number(european[3]), Number(european[2]), Number(european[1]));
    if (europeanDate) return europeanDate;
  }

  const shortYearEuropean = text.match(SHORT_YEAR_EUROPEAN_DATE_PATTERN);
  if (shortYearEuropean) {
    const literalYear = 2000 + Number(shortYearEuropean[3]);
    const shortYearDate = toIsoDate(literalYear, Number(shortYearEuropean[2]), Number(shortYearEuropean[1]));
    if (shortYearDate) return shortYearDate;
  }

  const normalized = stripAccents(text).toLowerCase();
  FRENCH_WRITTEN_DATE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FRENCH_WRITTEN_DATE_PATTERN.exec(normalized)) !== null) {
    const month = FRENCH_MONTHS[match[2]];
    if (!month) continue;
    const day = Number(match[1]);
    const year = match[3] ? Number(match[3]) : null;
    const resolved = year ? toIsoDate(year, month, day) : resolveYearlessDate(month, day, referenceDate);
    if (resolved) return resolved;
  }

  const shortEuropean = text.match(SHORT_EUROPEAN_DATE_PATTERN);
  if (shortEuropean) {
    const resolved = resolveYearlessDate(Number(shortEuropean[2]), Number(shortEuropean[1]), referenceDate);
    if (resolved) return resolved;
  }

  return null;
}

/**
 * Extracts a multi-day event date range (festivals, weekend bills) from
 * free-form text, e.g. "12 au 14 juin 2026" or "du 12-14 juin". Returns null
 * when no range pattern with two valid day numbers sharing one month is found.
 */
export function extractEventDateRange(
  text: string,
  referenceDate: Date = new Date()
): { start: string; end: string } | null {
  const normalized = stripAccents(text).toLowerCase();
  const match = normalized.match(FRENCH_WRITTEN_DATE_RANGE_PATTERN);
  if (!match) return null;

  const month = FRENCH_MONTHS[match[3]];
  if (!month) return null;

  const startDay = Number(match[1]);
  const endDay = Number(match[2]);
  if (endDay <= startDay) return null;

  const year = match[4] ? Number(match[4]) : null;
  const start = year ? toIsoDate(year, month, startDay) : resolveYearlessDate(month, startDay, referenceDate);
  const end = year ? toIsoDate(year, month, endDay) : resolveYearlessDate(month, endDay, referenceDate);
  if (!start || !end) return null;

  return { start, end };
}
