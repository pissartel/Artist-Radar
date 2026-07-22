const LEADING_FRENCH_ARTICLE_PATTERN = /^(le|la|les|l['’])\s*/i;

/**
 * Lowercases, strips accents and collapses whitespace. Used as the base
 * normalization step before venue-name-specific handling below, and for
 * general free-text identity keys (city, country, artist name).
 */
export function normalizeKey(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Handles common venue-name variants for the same place, e.g. "Le
 * Krakatoa", "Krakatoa" and "Krakatoa Mérignac": strips a leading French
 * article and, when the venue name is suffixed with its own city, that
 * suffix too, so all three collapse to the same dedup identity. Only meant
 * for identity/dedup keys, never for a displayed venue name.
 */
export function normalizeVenueName(venueName: string, city: string | null): string {
  const withoutArticle = normalizeKey(venueName).replace(LEADING_FRENCH_ARTICLE_PATTERN, "").trim();
  const normalizedCity = city ? normalizeKey(city) : "";
  if (!normalizedCity || !withoutArticle.endsWith(` ${normalizedCity}`)) {
    return withoutArticle;
  }
  const withoutCitySuffix = withoutArticle.slice(0, -(normalizedCity.length + 1)).trim();
  return withoutCitySuffix || withoutArticle;
}
