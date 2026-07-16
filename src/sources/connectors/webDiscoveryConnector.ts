import { extractPublicContactSignals } from "../../booking/contactExtraction.js";
import type { WebExtractProvider } from "../../providers/web/WebExtractProvider.js";
import type { WebSearchProvider, WebSearchResult } from "../../providers/web/WebSearchProvider.js";
import { debugLog, warnLog } from "../../utils/logger.js";
import { parseOrganizationSourceRecord, type OrganizationSourceRecord } from "../organization.schema.js";
import {
  classifyOrganizationType,
  extractGenres,
  extractServices,
  extractTerritories
} from "./webDiscoveryClassifier.js";
import { buildOrganizationDiscoveryQueries, type DiscoveryQuery, type OrganizationDiscoveryContext } from "./webDiscoveryQueryBuilder.js";

// Reliability is intentionally lower than curated/authoritative connectors
// (musicbrainz 0.75, wikidata 0.7, trusted_directory 0.9): these are
// unverified web search results, not authoritative databases.
const VERIFIED_OFFICIAL_SITE_RELIABILITY = 0.55;
const UNVERIFIED_SNIPPET_ONLY_RELIABILITY = 0.35;
const HINT_ONLY_CLASSIFICATION_PENALTY = 0.1;

// Generic aggregator/directory domains are never treated as an organization's
// own official source (issue #126: "Reject directories without a traceable
// official source").
const UNTRUSTED_DIRECTORY_HOSTS = [
  "yelp.com",
  "yelp.fr",
  "pagesjaunes.fr",
  "tripadvisor.com",
  "tripadvisor.fr",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "wikipedia.org",
  "annuaire-gratuit.com",
  "lefigaro.fr",
  "songkick.com",
  "bandsintown.com"
];
const UNTRUSTED_PATH_SEGMENTS = ["/annuaire/", "/directory/", "/listing/", "/listings/"];

export interface WebDiscoveryConnectorOptions {
  searchProvider: WebSearchProvider;
  extractProvider?: WebExtractProvider | null;
  maxResultsPerQuery?: number;
}

export interface WebDiscoveryResult {
  records: OrganizationSourceRecord[];
  warnings: string[];
}

export async function discoverOrganizationsFromWeb(
  context: OrganizationDiscoveryContext,
  options: WebDiscoveryConnectorOptions
): Promise<WebDiscoveryResult> {
  const queries = buildOrganizationDiscoveryQueries(context);
  const warnings: string[] = [];
  const records: OrganizationSourceRecord[] = [];

  for (const discoveryQuery of queries) {
    let searchResults: WebSearchResult[] = [];
    try {
      searchResults = await options.searchProvider.search(discoveryQuery.query, {
        limit: options.maxResultsPerQuery ?? 5
      });
    } catch (error) {
      warnings.push(`Web discovery search failed for "${discoveryQuery.query}": ${errorMessage(error)}`);
      continue;
    }

    for (const result of searchResults) {
      try {
        const record = await buildRecordFromSearchResult(result, discoveryQuery, context, options.extractProvider ?? null);
        if (record) {
          records.push(record);
        }
      } catch (error) {
        warnings.push(`Web discovery processing failed for "${result.url ?? discoveryQuery.query}": ${errorMessage(error)}`);
      }
    }
  }

  debugLog("sources", "web discovery import fetched records", { queryCount: queries.length, recordCount: records.length });
  return { records, warnings };
}

async function buildRecordFromSearchResult(
  result: WebSearchResult,
  discoveryQuery: DiscoveryQuery,
  context: OrganizationDiscoveryContext,
  extractProvider: WebExtractProvider | null
): Promise<OrganizationSourceRecord | null> {
  if (!result.url) {
    return null;
  }

  const host = safeHostname(result.url);
  if (!host || isUntrustedSource(host, result.url)) {
    debugLog("sources", "web discovery result rejected: no traceable official source", { url: result.url });
    return null;
  }

  let pageText = [result.title, result.snippet].filter(Boolean).join("\n");
  let verifiedOfficialSite = false;

  if (extractProvider) {
    try {
      const extracted = await extractProvider.extract(result.url);
      const extractedText = extracted?.text ?? extracted?.markdown ?? null;
      if (extractedText) {
        pageText = [pageText, extractedText].join("\n");
        verifiedOfficialSite = true;
      }
    } catch (error) {
      warnLog("sources", "web discovery site visit failed", { url: result.url, message: errorMessage(error) });
    }
  }

  const classification = classifyOrganizationType(pageText, discoveryQuery.organizationTypeHint);
  if (!classification) {
    debugLog("sources", "web discovery result rejected: could not classify organization type", { url: result.url });
    return null;
  }

  const contacts = extractPublicContactSignals(pageText, result.links ?? []);
  const contactEmail = bestContactValue(contacts, "email");
  const contactFormUrl = bestContactValue(contacts, "contact_form");

  const genres = extractGenres(pageText, context.genres);
  const services = extractServices(pageText);
  const territories = extractTerritories(pageText, [
    discoveryQuery.city,
    context.artistCity,
    context.artistCountry,
    ...(context.targetCities ?? [])
  ]);

  const reliabilityScore = computeReliabilityScore(verifiedOfficialSite, classification.matchedFromText);
  const evidence = buildEvidence({
    classification,
    discoveryQuery,
    verifiedOfficialSite,
    genres,
    services,
    territories
  });

  return parseOrganizationSourceRecord({
    sourceType: "web_discovery",
    sourceName: `Web discovery: ${discoveryQuery.query}`,
    sourceUrl: result.url,
    extractedAt: new Date().toISOString(),
    reliabilityScore,
    name: result.title?.trim() || host,
    organizationType: classification.type,
    city: discoveryQuery.city,
    country: context.artistCountry ?? null,
    websiteUrl: result.url,
    contactEmail: contactEmail ?? null,
    contactFormUrl: contactFormUrl ?? null,
    genres,
    services,
    territories,
    evidence,
    notes: result.snippet ?? null
  });
}

function bestContactValue(
  contacts: ReturnType<typeof extractPublicContactSignals>,
  type: "email" | "contact_form"
): string | null {
  const candidates = contacts.filter((contact) => contact.type === type && contact.value);
  const best = [...candidates].sort((left, right) => right.confidence - left.confidence)[0];
  return best?.value ?? null;
}

function computeReliabilityScore(verifiedOfficialSite: boolean, matchedFromText: boolean): number {
  let score = verifiedOfficialSite ? VERIFIED_OFFICIAL_SITE_RELIABILITY : UNVERIFIED_SNIPPET_ONLY_RELIABILITY;
  if (!matchedFromText) {
    score -= HINT_ONLY_CLASSIFICATION_PENALTY;
  }
  return Math.max(0.1, Math.min(score, 1));
}

function buildEvidence(params: {
  classification: { type: string; matchedKeywords: string[]; matchedFromText: boolean };
  discoveryQuery: DiscoveryQuery;
  verifiedOfficialSite: boolean;
  genres: string[];
  services: string[];
  territories: string[];
}): string[] {
  const evidence: string[] = [];

  evidence.push(
    params.classification.matchedFromText
      ? `Classified as ${params.classification.type} from page content matching "${params.classification.matchedKeywords[0]}".`
      : `Classified as ${params.classification.type} based on the discovery query context only; not confirmed by page content.`
  );
  evidence.push(`Found via search query "${params.discoveryQuery.query}".`);
  evidence.push(
    params.verifiedOfficialSite
      ? "Official website content was fetched and reviewed."
      : "Official website could not be visited; classification relies on the search result snippet only."
  );
  if (params.genres.length > 0) {
    evidence.push(`Genre mentions found: ${params.genres.join(", ")}.`);
  }
  if (params.services.length > 0) {
    evidence.push(`Service mentions found: ${params.services.join(", ")}.`);
  }
  if (params.territories.length > 0) {
    evidence.push(`Territory mentions found: ${params.territories.join(", ")}.`);
  }

  return evidence;
}

function isUntrustedSource(host: string, url: string): boolean {
  const normalizedHost = host.replace(/^www\./, "");
  if (UNTRUSTED_DIRECTORY_HOSTS.some((entry) => normalizedHost === entry || normalizedHost.endsWith(`.${entry}`))) {
    return true;
  }
  const lowerUrl = url.toLowerCase();
  return UNTRUSTED_PATH_SEGMENTS.some((segment) => lowerUrl.includes(segment));
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
