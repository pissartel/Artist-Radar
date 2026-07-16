import { getMusicBrainzUserAgent, scheduleMusicBrainzRequest } from "../../services/musicBrainzService.js";
import { debugLog, warnLog } from "../../utils/logger.js";
import { parseOrganizationSourceRecord, type OrganizationSourceRecord } from "../organization.schema.js";

const MUSICBRAINZ_LABEL_RELIABILITY = 0.75;

interface MusicBrainzLabelSearchResponse {
  labels?: Array<{
    id?: string;
    name?: string;
    country?: string | null;
    area?: { name?: string | null } | string | null;
  }>;
}

interface MusicBrainzLabelLookupResponse {
  id?: string;
  name?: string;
  country?: string | null;
  area?: { name?: string | null } | string | null;
  relations?: Array<{
    type?: string;
    direction?: string;
    url?: { resource?: string };
    label?: { name?: string };
  }>;
}

interface MusicBrainzEnv {
  APP_USER_AGENT?: string;
}

type FetchLike = typeof fetch;

export async function searchMusicBrainzLabelsByName(
  labelName: string,
  env: MusicBrainzEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<OrganizationSourceRecord[]> {
  const trimmedName = labelName.trim();
  if (!trimmedName) {
    return [];
  }

  try {
    return await scheduleMusicBrainzRequest(async () => {
      const searchUrl = new URL("https://musicbrainz.org/ws/2/label");
      searchUrl.searchParams.set("query", `label:${trimmedName}`);
      searchUrl.searchParams.set("fmt", "json");
      searchUrl.searchParams.set("limit", "5");

      const userAgent = getMusicBrainzUserAgent(env);
      debugLog("musicbrainz", "label search request", { labelName: trimmedName });

      const searchResponse = await fetchImpl(searchUrl.toString(), {
        headers: { Accept: "application/json", "User-Agent": userAgent }
      });

      if (!searchResponse.ok) {
        warnLog("musicbrainz", "label request failed", { status: searchResponse.status, errorType: "http_error" });
        return [];
      }

      const searchData = (await searchResponse.json()) as MusicBrainzLabelSearchResponse;
      const candidates = (searchData.labels ?? []).filter((label): label is { id: string; name: string } & typeof label =>
        Boolean(label.id && label.name)
      );

      const records: OrganizationSourceRecord[] = [];
      for (const candidate of candidates) {
        const record = await lookupMusicBrainzLabel(candidate.id!, fetchImpl, userAgent);
        if (record) {
          records.push(record);
        }
      }

      debugLog("musicbrainz", "label search response", {
        labelName: trimmedName,
        resultCount: records.length
      });

      return records;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLog("musicbrainz", "label request failed", { status: null, errorType: "unknown", message });
    return [];
  }
}

async function lookupMusicBrainzLabel(
  labelId: string,
  fetchImpl: FetchLike,
  userAgent: string
): Promise<OrganizationSourceRecord | null> {
  const lookupUrl = new URL(`https://musicbrainz.org/ws/2/label/${encodeURIComponent(labelId)}`);
  lookupUrl.searchParams.set("fmt", "json");
  lookupUrl.searchParams.set("inc", "url-rels+label-rels");

  const lookupResponse = await fetchImpl(lookupUrl.toString(), {
    headers: { Accept: "application/json", "User-Agent": userAgent }
  });

  if (!lookupResponse.ok) {
    warnLog("musicbrainz", "label lookup failed", { status: lookupResponse.status, errorType: "http_error" });
    return null;
  }

  const lookup = (await lookupResponse.json()) as MusicBrainzLabelLookupResponse;
  if (!lookup.id || !lookup.name) {
    return null;
  }

  const relations = lookup.relations ?? [];
  const websiteUrl = relations.find((relation) => relation.type === "official homepage")?.url?.resource ?? null;
  const relatedOrganizations = relations
    .filter((relation) => relation.type === "label rels" || Boolean(relation.label?.name))
    .map((relation) => relation.label?.name)
    .filter((name): name is string => Boolean(name));

  return parseOrganizationSourceRecord({
    sourceType: "musicbrainz",
    sourceName: "MusicBrainz",
    sourceUrl: `https://musicbrainz.org/label/${encodeURIComponent(lookup.id)}`,
    extractedAt: new Date().toISOString(),
    reliabilityScore: MUSICBRAINZ_LABEL_RELIABILITY,
    name: lookup.name,
    organizationType: "LABEL",
    city: extractAreaName(lookup.area),
    country: normalizeCountry(lookup.country),
    websiteUrl,
    contactEmail: null,
    contactFormUrl: null,
    relatedOrganizations,
    notes: null
  });
}

function extractAreaName(value: { name?: string | null } | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  return value.name?.trim() || null;
}

function normalizeCountry(country: string | null | undefined): string | null {
  const trimmed = country?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toUpperCase() === "FR" ? "France" : trimmed;
}
