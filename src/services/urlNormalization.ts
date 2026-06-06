const UNCERTAIN_URL_VALUES = new Set([
  "",
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "site officiel",
  "à rechercher",
  "a rechercher"
]);

export function normalizeNullableUrl(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (UNCERTAIN_URL_VALUES.has(trimmed.toLowerCase())) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

export function normalizeNullableContact(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (UNCERTAIN_URL_VALUES.has(trimmed.toLowerCase())) {
    return null;
  }

  if (looksUrlLike(trimmed)) {
    return normalizeNullableUrl(trimmed);
  }

  return trimmed;
}

export function normalizeOpportunityUrls(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.opportunities)) {
    return value;
  }

  return {
    ...value,
    opportunities: value.opportunities.map((opportunity) => {
      if (!isRecord(opportunity)) {
        return opportunity;
      }

      return {
        ...opportunity,
        source_url: normalizeNullableUrl(opportunity.source_url),
        contact: normalizeNullableContact(opportunity.contact)
      };
    })
  };
}

function looksUrlLike(value: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
