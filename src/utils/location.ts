// Shared location normalization: a city is never literally the same string
// as its own country (e.g. city "France", country "France" from a source
// that only knows the country). When that happens, treat the city as
// unknown rather than display duplicated location text downstream.
export function normalizeLocationParts(
  city: string | null | undefined,
  country: string | null | undefined
): { city: string | null; country: string | null } {
  const normalizedCity = city?.trim() || null;
  const normalizedCountry = country?.trim() || null;

  if (normalizedCity && normalizedCountry && normalizedCity.toLowerCase() === normalizedCountry.toLowerCase()) {
    return { city: null, country: normalizedCountry };
  }

  return { city: normalizedCity, country: normalizedCountry };
}
