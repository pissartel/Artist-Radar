import type { IndustryOrganization } from "./types.js";

export function normalizeIndustryName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(sarl|sas|ltd|llc|inc|records?|music|booking|management|agency)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeIndustryDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

export function industryIdentityKey(org: Pick<IndustryOrganization, "normalizedName" | "organizationType" | "country" | "website">): string {
  const domain = normalizeIndustryDomain(org.website);
  return domain ? `${org.organizationType}:domain:${domain}` : `${org.organizationType}:name:${org.normalizedName}:${org.country?.toLowerCase() ?? ""}`;
}

export function deduplicateIndustryOrganizations(items: IndustryOrganization[]): IndustryOrganization[] {
  const result = new Map<string, IndustryOrganization>();
  for (const item of items) {
    const key = industryIdentityKey(item);
    const previous = result.get(key);
    if (!previous) { result.set(key, item); continue; }
    result.set(key, {
      ...previous, ...item,
      id: previous.id ?? item.id,
      contacts: uniqueBy([...previous.contacts, ...item.contacts], (v) => `${v.email ?? ""}:${v.publicProfileUrl ?? ""}`),
      artistRelations: uniqueBy([...previous.artistRelations, ...item.artistRelations], (v) => `${normalizeIndustryName(v.artistName)}:${v.relationshipType}:${v.sourceUrl}`),
      sources: uniqueBy([...previous.sources, ...item.sources], (v) => v.url),
      genres: [...new Set([...previous.genres, ...item.genres])],
      confidenceScore: Math.max(previous.confidenceScore, item.confidenceScore)
    });
  }
  return [...result.values()];
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}
