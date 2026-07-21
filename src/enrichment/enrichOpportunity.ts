import { extractPublicContactSignals } from "../booking/contactExtraction.js";
import type { BookingSourceType, ContactCandidate } from "../booking/types.js";
import type { WebExtractProvider, WebExtractResult } from "../providers/web/WebExtractProvider.js";
import type { WebSearchProvider } from "../providers/web/WebSearchProvider.js";
import { debugLog } from "../utils/logger.js";
import { classifyContactRole } from "./classifyContact.js";
import { rankContacts } from "./contactPriority.js";
import { extractOrganizerAndPromoter } from "./organizerExtraction.js";
import {
  HEADLINER_AGENCY_SEARCH_MARKER,
  type EnrichableOpportunity,
  type EnrichedContact,
  type OpportunityEnrichment,
  type VerifiableField
} from "./types.js";

const OFFICIAL_SOURCE_TYPES: BookingSourceType[] = [
  "official_site",
  "venue_official_programming_page",
  "festival_official_page",
  "promoter_official_page"
];

const SOCIAL_LINK_PATTERN = /instagram\.com|facebook\.com|linktr\.ee|twitter\.com|x\.com|tiktok\.com/i;
const TICKET_LINK_PATTERN = /billet|ticket|rsvp|inscription|register/i;
const BOOKING_INSTRUCTIONS_PATTERN = /(booking request|how to book|send your (demo|epk|press kit)|submission[s]?|submit your|apply here|contactez[- ]nous pour|demande de booking)/i;
const LINEUP_LABEL_PATTERN = /(line-?up|lineup|plateau|à l'affiche)\s*[:\-]\s*(.+)/i;
const ADDRESS_PATTERN = /\d{1,4}[^\n,]{0,60}\b(rue|avenue|av\.|boulevard|blvd|street|road|str\.|place|square)\b[^\n]{0,80}/i;

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  result: OpportunityEnrichment;
  expiresAt: number;
}

const enrichmentCache = new Map<string, CacheEntry>();

export interface EnrichOpportunityOptions {
  webExtractProvider?: WebExtractProvider | null;
  /** Used only to locate the headline artist's booking agency/tour contact when it isn't on the opportunity's own source page. */
  webSearchProvider?: WebSearchProvider | null;
  now?: Date;
  forceRefresh?: boolean;
  cacheTtlMs?: number;
}

/**
 * Builds the enrichment result for a single opportunity: fetches its source
 * page (when a provider is configured) and re-derives contacts, social
 * profiles and other actionable details from that live content. Results are
 * cached in-memory per opportunity so opening the same opportunity twice
 * doesn't refetch; pass `forceRefresh: true` to bypass the cache.
 */
export async function enrichOpportunity(
  opportunity: EnrichableOpportunity,
  options: EnrichOpportunityOptions = {}
): Promise<OpportunityEnrichment> {
  const now = options.now ?? new Date();
  const cacheKey = buildCacheKey(opportunity);

  if (!options.forceRefresh) {
    const cached = enrichmentCache.get(cacheKey);
    if (cached && cached.expiresAt > now.getTime()) {
      return cached.result;
    }
  }

  const result = await buildEnrichment(opportunity, options, now);
  enrichmentCache.set(cacheKey, {
    result,
    expiresAt: now.getTime() + (options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS)
  });
  return result;
}

/** Forces a fresh fetch and re-extraction, refreshing previously cached contact details. */
export async function refreshOpportunityEnrichment(
  opportunity: EnrichableOpportunity,
  options: EnrichOpportunityOptions = {}
): Promise<OpportunityEnrichment> {
  return enrichOpportunity(opportunity, { ...options, forceRefresh: true });
}

export function clearEnrichmentCache(): void {
  enrichmentCache.clear();
}

async function buildEnrichment(
  opportunity: EnrichableOpportunity,
  options: EnrichOpportunityOptions,
  now: Date
): Promise<OpportunityEnrichment> {
  const warnings: string[] = [];
  const sourceUrl = opportunity.sourceUrl;
  const extractProvider = options.webExtractProvider ?? null;

  let page: WebExtractResult | null = null;
  if (!sourceUrl) {
    warnings.push("No source URL available; contact details could not be verified.");
  } else if (!extractProvider) {
    warnings.push("No page extraction provider configured; contact details could not be re-verified.");
  } else {
    try {
      page = await extractProvider.extract(sourceUrl);
      if (!page) {
        warnings.push("Source page could not be fetched; showing previously known details as unverified.");
      }
    } catch (error) {
      warnings.push(`Source page fetch failed: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }

  debugLog("enrichment", "enrichment run", {
    opportunityName: opportunity.name,
    sourceUrl,
    pageFetched: Boolean(page)
  });

  const pageText = [page?.text, page?.markdown].filter(Boolean).join("\n");
  const links = extractLinksFromText(pageText);

  const headliner = extractHeadliner(pageText, sourceUrl, Boolean(page));
  const headlinerNames = headliner.value ?? opportunity.headliners ?? [];
  const agencyContacts = await findHeadlinerAgencyContacts(
    opportunity,
    headlinerNames,
    options.webSearchProvider ?? null,
    extractProvider,
    warnings
  );

  const contacts = mergeContacts(opportunity.contacts, pageText, links, sourceUrl, agencyContacts);
  const socialProfiles = links
    .filter((link) => SOCIAL_LINK_PATTERN.test(link))
    .map((link): VerifiableField<string> => ({ value: link, verified: Boolean(page), sourceUrl }));
  const ticketUrl = extractTicketUrl(links, sourceUrl, Boolean(page));
  const organizerExtraction = pageText ? extractOrganizerAndPromoter(pageText) : { organizerName: null, promoterName: null };

  const { primaryContact, secondaryActions, confidenceLevel } = rankContacts({
    contacts,
    socialProfiles,
    ticketUrl,
    headliners: headlinerNames,
    primarySourceUrl: sourceUrl
  });

  return {
    opportunityName: opportunity.name,
    officialWebsite: buildOfficialWebsite(opportunity, sourceUrl),
    sourcePage: { value: sourceUrl, verified: Boolean(sourceUrl), sourceUrl },
    contacts,
    socialProfiles,
    bookingInstructions: extractBookingInstructions(pageText, sourceUrl, Boolean(page)),
    organizerName: buildNameField(organizerExtraction.organizerName, sourceUrl, Boolean(page)),
    promoterName: buildNameField(organizerExtraction.promoterName, sourceUrl, Boolean(page)),
    venueAddress: extractVenueAddress(pageText, sourceUrl, Boolean(page)),
    eventDate: {
      value: opportunity.eventDate ?? null,
      verified: Boolean(page) && Boolean(opportunity.eventDate) && pageText.includes(opportunity.eventDate ?? ""),
      sourceUrl
    },
    headliner,
    ticketUrl,
    primaryContact,
    secondaryActions,
    confidenceLevel,
    lastVerifiedAt: now.toISOString(),
    warnings
  };
}

function buildNameField(value: string | null, sourceUrl: string | null, pageFetched: boolean): VerifiableField<string> {
  if (!pageFetched || !value) {
    return { value: null, verified: false, sourceUrl: null };
  }
  return { value, verified: true, sourceUrl };
}

interface AgencyContactCandidate {
  candidate: ContactCandidate;
  contextText: string;
}

/**
 * Searches for the headline artist's booking agency/tour-manager contact
 * (issue #159 scope: search combining announced artists, event context and
 * source domain). Only trusts a contact confirmed on a freshly fetched page —
 * a search-result snippet alone is never enough to store a contact.
 */
async function findHeadlinerAgencyContacts(
  opportunity: EnrichableOpportunity,
  headliners: string[],
  webSearchProvider: WebSearchProvider | null,
  webExtractProvider: WebExtractProvider | null,
  warnings: string[]
): Promise<AgencyContactCandidate[]> {
  const headliner = headliners[0];
  if (!webSearchProvider || !webExtractProvider || !headliner) {
    return [];
  }

  const query = buildHeadlinerAgencyQuery(opportunity, headliner);
  let results: Awaited<ReturnType<WebSearchProvider["search"]>> = [];
  try {
    results = await webSearchProvider.search(query, { limit: 3 });
  } catch (error) {
    warnings.push(`Headliner agency search failed: ${error instanceof Error ? error.message : String(error)}.`);
    return [];
  }

  const sourceHostname = safeHostname(opportunity.sourceUrl);
  const candidateUrl = results
    .map((result) => result.url)
    .find((url): url is string => Boolean(url) && safeHostname(url) !== sourceHostname && !isAggregatorUrl(url as string));
  if (!candidateUrl) {
    return [];
  }

  try {
    const page = await webExtractProvider.extract(candidateUrl);
    if (!page) {
      return [];
    }
    const pageText = [page.text, page.markdown].filter(Boolean).join("\n");
    const links = extractLinksFromText(pageText);
    return extractPublicContactSignals(pageText, links)
      .filter((signal): signal is ContactCandidate & { value: string } => Boolean(signal.value))
      .map((signal) => ({
        candidate: {
          ...signal,
          sourceUrl: signal.sourceUrl ?? candidateUrl,
          notes: [signal.notes, HEADLINER_AGENCY_SEARCH_MARKER].filter(Boolean).join(" ")
        },
        contextText: pageText
      }));
  } catch (error) {
    warnings.push(`Headliner agency page fetch failed: ${error instanceof Error ? error.message : String(error)}.`);
    return [];
  }
}

function buildHeadlinerAgencyQuery(opportunity: EnrichableOpportunity, headliner: string): string {
  const context = [opportunity.venueName, opportunity.city].filter(Boolean).join(" ");
  return `${headliner} booking agent OR agency OR "tour manager" ${context}`.trim();
}

const AGGREGATOR_HOSTNAMES = [
  "instagram.com",
  "facebook.com",
  "youtube.com",
  "youtu.be",
  "ticketmaster.com",
  "dice.fm",
  "shotgun.live",
  "eventbrite.com",
  "songkick.com",
  "bandsintown.com"
];

function isAggregatorUrl(value: string): boolean {
  const hostname = safeHostname(value);
  if (!hostname) {
    return true;
  }
  return AGGREGATOR_HOSTNAMES.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function safeHostname(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function mergeContacts(
  existingContacts: ContactCandidate[],
  pageText: string,
  links: string[],
  sourceUrl: string | null,
  agencyContacts: AgencyContactCandidate[]
): EnrichedContact[] {
  const freshContacts = pageText ? extractPublicContactSignals(pageText, links) : [];
  const merged = new Map<string, EnrichedContact>();

  for (const contact of freshContacts) {
    if (!contact.value) {
      continue;
    }
    // Classify from the value and its raw page context only, not from
    // `contact.notes` (a free-text summary from contactExtraction.ts whose
    // wording, e.g. "weaker for booking", can itself contain role keywords
    // and would otherwise contaminate the classification).
    const contextLine = extractContextLine(contact.value, pageText);
    merged.set(contactKey(contact.type, contact.value), {
      type: contact.type,
      value: contact.value,
      role: classifyContactRole(contact.value, contextLine),
      sourceUrl: contact.sourceUrl ?? sourceUrl,
      verified: true,
      notes: contact.notes ?? null
    });
  }

  // Contacts confirmed on a separately fetched page (e.g. the headliner's
  // booking agency site): classified from that page's own context, since the
  // value won't appear anywhere in the opportunity's own `pageText`.
  for (const { candidate, contextText } of agencyContacts) {
    if (!candidate.value) {
      continue;
    }
    const key = contactKey(candidate.type, candidate.value);
    if (merged.has(key)) {
      continue;
    }
    const contextLine = extractContextLine(candidate.value, contextText);
    merged.set(key, {
      type: candidate.type,
      value: candidate.value,
      role: classifyContactRole(candidate.value, contextLine),
      sourceUrl: candidate.sourceUrl ?? sourceUrl,
      verified: true,
      notes: candidate.notes ?? null
    });
  }

  // Contacts already known from earlier discovery that could not be
  // reconfirmed against the freshly fetched page: kept visible, but marked
  // unverified rather than silently dropped or upgraded.
  for (const contact of existingContacts) {
    if (!contact.value) {
      continue;
    }
    const key = contactKey(contact.type, contact.value);
    if (merged.has(key)) {
      continue;
    }
    merged.set(key, {
      type: contact.type,
      value: contact.value,
      // No fresh page context is available for a carried-over contact;
      // classify from its value alone (see note above about `notes`).
      role: classifyContactRole(contact.value, ""),
      sourceUrl: contact.sourceUrl,
      verified: false,
      notes: contact.notes ?? null
    });
  }

  return [...merged.values()];
}

function contactKey(type: string, value: string): string {
  return `${type}:${value.trim().toLowerCase()}`;
}

/**
 * Same-line context only (not a fixed character window): a page listing
 * "Booking: a@x.test" directly above "Press: b@x.test" must not let the
 * booking label bleed into the press contact's classification.
 */
function extractContextLine(value: string, text: string): string {
  const index = text.toLowerCase().indexOf(value.toLowerCase());
  if (index < 0) {
    return "";
  }
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEndIndex = text.indexOf("\n", index);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  return text.slice(lineStart, lineEnd);
}

function buildOfficialWebsite(opportunity: EnrichableOpportunity, sourceUrl: string | null): VerifiableField<string> {
  if (sourceUrl && OFFICIAL_SOURCE_TYPES.includes(opportunity.sourceType)) {
    return { value: sourceUrl, verified: true, sourceUrl };
  }
  return { value: null, verified: false, sourceUrl: null };
}

function extractBookingInstructions(pageText: string, sourceUrl: string | null, pageFetched: boolean): VerifiableField<string> {
  if (!pageFetched) {
    return { value: null, verified: false, sourceUrl: null };
  }
  const match = pageText.match(BOOKING_INSTRUCTIONS_PATTERN);
  if (!match || match.index === undefined) {
    return { value: null, verified: false, sourceUrl: null };
  }
  const snippet = pageText.slice(match.index, match.index + 240).split("\n")[0].trim();
  return { value: snippet, verified: true, sourceUrl };
}

function extractVenueAddress(pageText: string, sourceUrl: string | null, pageFetched: boolean): VerifiableField<string> {
  if (!pageFetched) {
    return { value: null, verified: false, sourceUrl: null };
  }
  const match = pageText.match(ADDRESS_PATTERN);
  if (!match) {
    return { value: null, verified: false, sourceUrl: null };
  }
  return { value: match[0].trim(), verified: true, sourceUrl };
}

function extractHeadliner(pageText: string, sourceUrl: string | null, pageFetched: boolean): VerifiableField<string[]> {
  if (!pageFetched) {
    return { value: null, verified: false, sourceUrl: null };
  }
  const match = pageText.match(LINEUP_LABEL_PATTERN);
  if (!match) {
    return { value: null, verified: false, sourceUrl: null };
  }
  const names = match[2]
    .split(/\n|,|•|\|/)
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (names.length === 0) {
    return { value: null, verified: false, sourceUrl: null };
  }
  return { value: names, verified: true, sourceUrl };
}

function extractTicketUrl(links: string[], sourceUrl: string | null, pageFetched: boolean): VerifiableField<string> {
  if (!pageFetched) {
    return { value: null, verified: false, sourceUrl: null };
  }
  const ticketLink = links.find((link) => TICKET_LINK_PATTERN.test(link));
  if (!ticketLink) {
    return { value: null, verified: false, sourceUrl: null };
  }
  return { value: ticketLink, verified: true, sourceUrl };
}

const MARKDOWN_LINK_PATTERN = /\[[^\]]*]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL_PATTERN = /https?:\/\/[^\s)"'<>]+/g;

function extractLinksFromText(text: string): string[] {
  if (!text) {
    return [];
  }
  const links = new Set<string>();
  for (const match of text.matchAll(MARKDOWN_LINK_PATTERN)) {
    links.add(match[1]);
  }
  for (const url of text.match(BARE_URL_PATTERN) ?? []) {
    links.add(url);
  }
  return [...links];
}

function buildCacheKey(opportunity: EnrichableOpportunity): string {
  return `${opportunity.sourceUrl ?? "no-source"}::${opportunity.name}`;
}
