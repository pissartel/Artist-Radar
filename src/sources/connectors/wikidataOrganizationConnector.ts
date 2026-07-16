import { debugLog, warnLog } from "../../utils/logger.js";
import {
  parseOrganizationSourceRecord,
  type OrganizationEntityType,
  type OrganizationSourceRecord
} from "../organization.schema.js";

const WIKIDATA_RELIABILITY = 0.7;
const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const COUNTRY_CLAIM = "P17";
const LOCATION_CLAIM = "P131";
const WEBSITE_CLAIM = "P856";

type FetchLike = typeof fetch;

interface WikidataSearchResponse {
  search?: Array<{ id?: string; label?: string; description?: string }>;
}

interface WikidataClaimValue {
  mainsnak?: {
    datavalue?: {
      value?: string | { id?: string };
    };
  };
}

interface WikidataEntity {
  labels?: Record<string, { value?: string } | undefined>;
  descriptions?: Record<string, { value?: string } | undefined>;
  claims?: Record<string, WikidataClaimValue[] | undefined>;
}

interface WikidataEntitiesResponse {
  entities?: Record<string, WikidataEntity | undefined>;
}

export async function searchWikidataOrganizationsByName(
  query: string,
  fetchImpl: FetchLike = fetch
): Promise<OrganizationSourceRecord[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const candidates = await searchWikidataEntities(trimmedQuery, fetchImpl);
  if (candidates.length === 0) {
    debugLog("wikidata", "no organization match", { query: trimmedQuery });
    return [];
  }

  const entities = await fetchWikidataEntities(
    candidates.map((candidate) => candidate.id),
    ["claims", "labels", "descriptions"],
    fetchImpl
  );

  const referencedQids = new Set<string>();
  for (const entity of Object.values(entities)) {
    for (const claimId of [COUNTRY_CLAIM, LOCATION_CLAIM]) {
      const qid = extractEntityIdValue(entity?.claims?.[claimId]?.[0]);
      if (qid) {
        referencedQids.add(qid);
      }
    }
  }

  const referencedLabels =
    referencedQids.size > 0 ? await fetchWikidataEntities(Array.from(referencedQids), ["labels"], fetchImpl) : {};

  const records: OrganizationSourceRecord[] = [];
  for (const candidate of candidates) {
    const entity = entities[candidate.id];
    if (!entity) {
      continue;
    }

    const name = entity.labels?.en?.value ?? candidate.label;
    if (!name) {
      continue;
    }

    const description = entity.descriptions?.en?.value ?? candidate.description;
    const countryQid = extractEntityIdValue(entity.claims?.[COUNTRY_CLAIM]?.[0]);
    const locationQid = extractEntityIdValue(entity.claims?.[LOCATION_CLAIM]?.[0]);
    const websiteUrl = extractStringValue(entity.claims?.[WEBSITE_CLAIM]?.[0]);

    records.push(
      parseOrganizationSourceRecord({
        sourceType: "wikidata",
        sourceName: "Wikidata",
        sourceUrl: `https://www.wikidata.org/wiki/${candidate.id}`,
        extractedAt: new Date().toISOString(),
        reliabilityScore: WIKIDATA_RELIABILITY,
        name,
        organizationType: inferOrganizationType(description),
        city: locationQid ? referencedLabels[locationQid]?.labels?.en?.value ?? null : null,
        country: countryQid ? referencedLabels[countryQid]?.labels?.en?.value ?? null : null,
        websiteUrl,
        contactEmail: null,
        contactFormUrl: null,
        notes: description ?? null
      })
    );
  }

  debugLog("wikidata", "organization search response", { query: trimmedQuery, resultCount: records.length });
  return records;
}

async function searchWikidataEntities(
  query: string,
  fetchImpl: FetchLike
): Promise<Array<{ id: string; label?: string; description?: string }>> {
  const searchUrl = new URL(WIKIDATA_API_URL);
  searchUrl.searchParams.set("action", "wbsearchentities");
  searchUrl.searchParams.set("search", query);
  searchUrl.searchParams.set("language", "en");
  searchUrl.searchParams.set("type", "item");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("limit", "5");

  const response = await fetchImpl(searchUrl.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) {
    warnLog("wikidata", "search request failed", { status: response.status, errorType: "http_error" });
    return [];
  }

  const data = (await response.json()) as WikidataSearchResponse;
  return (data.search ?? [])
    .filter((entry): entry is { id: string; label?: string; description?: string } => Boolean(entry.id))
    .map((entry) => ({ id: entry.id, label: entry.label, description: entry.description }));
}

async function fetchWikidataEntities(
  ids: string[],
  props: string[],
  fetchImpl: FetchLike
): Promise<Record<string, WikidataEntity | undefined>> {
  if (ids.length === 0) {
    return {};
  }

  const entitiesUrl = new URL(WIKIDATA_API_URL);
  entitiesUrl.searchParams.set("action", "wbgetentities");
  entitiesUrl.searchParams.set("ids", ids.join("|"));
  entitiesUrl.searchParams.set("props", props.join("|"));
  entitiesUrl.searchParams.set("languages", "en");
  entitiesUrl.searchParams.set("format", "json");

  const response = await fetchImpl(entitiesUrl.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) {
    warnLog("wikidata", "entities request failed", { status: response.status, errorType: "http_error" });
    return {};
  }

  const data = (await response.json()) as WikidataEntitiesResponse;
  return data.entities ?? {};
}

function extractEntityIdValue(claim: WikidataClaimValue | undefined): string | null {
  const value = claim?.mainsnak?.datavalue?.value;
  if (value && typeof value === "object" && "id" in value && value.id) {
    return value.id;
  }
  return null;
}

function extractStringValue(claim: WikidataClaimValue | undefined): string | null {
  const value = claim?.mainsnak?.datavalue?.value;
  return typeof value === "string" ? value : null;
}

function inferOrganizationType(description: string | null | undefined): OrganizationEntityType {
  const text = (description ?? "").toLowerCase();
  if (text.includes("record label") || text.includes("music label")) {
    return "LABEL";
  }
  if (text.includes("venue") || text.includes("concert hall") || text.includes("music club")) {
    return "VENUE";
  }
  if (text.includes("booking agency") || text.includes("talent agency")) {
    return "BOOKER";
  }
  if (text.includes("artist management") || text.includes("management company")) {
    return "MANAGER";
  }
  if (text.includes("promoter") || text.includes("concert promotion")) {
    return "PROMOTER";
  }
  return "ASSOCIATION";
}
