import OpenAI from "openai";
import type {
  CachedVenueEnrichment,
  VenueEnrichment,
  VenueOfficialUrlType,
  VenueEnrichmentRequest,
  VenueEnrichmentSource,
} from "@/types/venueEnrichment";
import { getDefaultVenueEnrichmentCache, type VenueEnrichmentCache } from "@/lib/server/venueEnrichmentCache";

export const VENUE_ENRICHMENT_VERSION = 5;
export const VENUE_ENRICHMENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const VENUE_ENRICHMENT_NEGATIVE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface ScrapedVenuePage {
  url: string;
  title: string | null;
  text: string;
}

interface VenueEnrichmentServiceDeps {
  cache?: VenueEnrichmentCache;
  now?: () => Date;
  scrapePages?: (venue: VenueEnrichmentRequest) => Promise<ScrapedVenuePage[]>;
  extractFromPages?: (venue: VenueEnrichmentRequest, pages: ScrapedVenuePage[]) => Promise<VenueEnrichment>;
  extractWithWebSearch?: (venue: VenueEnrichmentRequest, missingFields: string[]) => Promise<VenueEnrichment>;
  discoverOfficialPresence?: (venue: VenueEnrichmentRequest, current: VenueEnrichment) => Promise<VenueEnrichment>;
}

interface VenueOfficialPresenceCandidate {
  title: string | null;
  url: string;
  snippet: string | null;
  sourceProvider: string;
  confidence: number;
  query: string;
}

const inFlight = new Map<string, Promise<CachedVenueEnrichment>>();

export async function getOrEnrichVenue(
  venue: VenueEnrichmentRequest,
  deps: VenueEnrichmentServiceDeps = {},
): Promise<CachedVenueEnrichment> {
  const normalizedVenue = normalizeVenueRequest(venue);
  const cache = deps.cache ?? getDefaultVenueEnrichmentCache();
  const now = deps.now ?? (() => new Date());
  const cached = await cache.get(normalizedVenue.id);

  if (cached && !shouldRefreshVenueEnrichment(cached, now())) {
    return { ...cached, cacheHit: true };
  }

  const active = inFlight.get(normalizedVenue.id);
  if (active) return active;

  const promise = enrichAndPersist(normalizedVenue, cache, now, deps).finally(() => {
    inFlight.delete(normalizedVenue.id);
  });
  inFlight.set(normalizedVenue.id, promise);
  return promise;
}

export function shouldRefreshVenueEnrichment(record: CachedVenueEnrichment, now = new Date()): boolean {
  if (record.enrichmentVersion !== VENUE_ENRICHMENT_VERSION) return true;
  const enrichedAt = new Date(record.enrichedAt);
  if (Number.isNaN(enrichedAt.getTime())) return true;
  const ttl = record.enrichment.officialUrl ? VENUE_ENRICHMENT_TTL_MS : VENUE_ENRICHMENT_NEGATIVE_TTL_MS;
  return now.getTime() - enrichedAt.getTime() > ttl;
}

async function enrichAndPersist(
  venue: VenueEnrichmentRequest,
  cache: VenueEnrichmentCache,
  now: () => Date,
  deps: VenueEnrichmentServiceDeps,
): Promise<CachedVenueEnrichment> {
  const scrapePages = deps.scrapePages ?? scrapeOfficialVenuePages;
  const extractFromPages = deps.extractFromPages ?? extractVenueFromPagesWithOpenAI;
  const extractWithWebSearch = deps.extractWithWebSearch ?? extractVenueWithOpenAIWebSearch;

  const base = baseVenueEnrichment(venue);
  let scraped: VenueEnrichment = emptyVenueEnrichment();
  let webFallback: VenueEnrichment = emptyVenueEnrichment();

  const scrapeWebsite = base.officialUrl ?? base.website;
  const pages = scrapeWebsite ? await scrapePages({ ...venue, website: scrapeWebsite }) : [];
  if (pages.length > 0) {
    scraped = await extractFromPages(venue, pages);
  }

  const afterScrape = mergeVenueEnrichment(base, scraped);
  const missingFields = getImportantMissingVenueFields(afterScrape);
  if (missingFields.length > 0) {
    webFallback = await extractWithWebSearch(venue, missingFields);
  }

  const record: CachedVenueEnrichment = {
    venueId: venue.id,
    enrichedAt: now().toISOString(),
    enrichmentVersion: VENUE_ENRICHMENT_VERSION,
    enrichment: mergeVenueEnrichment(afterScrape, webFallback),
    cacheHit: false,
  };
  // Enrichment data is more important than this best-effort file cache.
  // Serverless filesystems may be read-only or ephemeral; a cache write
  // failure must never turn a successful OpenAI response into a 500.
  try {
    await cache.set(record);
  } catch (error) {
    console.warn(`Venue enrichment cache write failed for ${venue.id}:`, error);
  }
  return record;
}

export function getImportantMissingVenueFields(enrichment: VenueEnrichment): string[] {
  const missing: string[] = [];
  if (!enrichment.description) missing.push("short description");
  if (!enrichment.type) missing.push("venue type");
  if (!enrichment.address) missing.push("full address");
  if (!enrichment.officialUrl && !enrichment.website) missing.push("official web presence");
  if (enrichment.capacity == null) missing.push("capacity");
  if (!enrichment.bookingEmail && !enrichment.contactEmail && !enrichment.contactUrl) {
    missing.push("booking or programming contact");
  }
  if (!enrichment.programmingUrl) missing.push("programming or agenda URL");
  if (!enrichment.instagram && !enrichment.facebook && (enrichment.otherSocialLinks?.length ?? 0) === 0) {
    missing.push("official social accounts");
  }
  if ((enrichment.genres?.length ?? 0) === 0) missing.push("typical music genres");
  if (enrichment.programsLiveMusic == null) missing.push("live music programming");
  return missing;
}

export function mergeVenueEnrichment(primary: VenueEnrichment, secondary: VenueEnrichment): VenueEnrichment {
  return {
    officialName: firstText(primary.officialName, secondary.officialName),
    officialUrl: firstOfficialUrl(primary, secondary),
    officialUrlType: primary.officialUrl ? primary.officialUrlType ?? null : secondary.officialUrlType ?? null,
    officialOrganizationName: primary.officialUrl ? primary.officialOrganizationName ?? null : secondary.officialOrganizationName ?? null,
    officialUrlConfidence: primary.officialUrl ? primary.officialUrlConfidence ?? null : secondary.officialUrlConfidence ?? null,
    enrichmentSource: firstText(primary.enrichmentSource, secondary.enrichmentSource),
    description: firstText(primary.description, secondary.description),
    type: firstText(primary.type, secondary.type),
    address: firstText(primary.address, secondary.address),
    city: firstText(primary.city, secondary.city),
    country: firstText(primary.country, secondary.country),
    capacity: primary.capacity ?? secondary.capacity ?? null,
    website: firstUrl(primary.website, secondary.website),
    programmingUrl: firstUrl(primary.programmingUrl, secondary.programmingUrl),
    contactUrl: firstUrl(primary.contactUrl, secondary.contactUrl),
    contactEmail: firstText(primary.contactEmail, secondary.contactEmail),
    bookingEmail: firstText(primary.bookingEmail, secondary.bookingEmail),
    bookingContactName: firstText(primary.bookingContactName, secondary.bookingContactName),
    phone: firstText(primary.phone, secondary.phone),
    instagram: firstUrl(primary.instagram, secondary.instagram),
    facebook: firstUrl(primary.facebook, secondary.facebook),
    otherSocialLinks: dedupeStrings([...(primary.otherSocialLinks ?? []), ...(secondary.otherSocialLinks ?? [])]),
    genres: dedupeStrings([...(primary.genres ?? []), ...(secondary.genres ?? [])]),
    programsLiveMusic: primary.programsLiveMusic ?? secondary.programsLiveMusic ?? null,
    booksEmergingArtists: primary.booksEmergingArtists ?? secondary.booksEmergingArtists ?? null,
    programmedArtists: dedupeProgrammedArtists([
      ...(primary.programmedArtists ?? []),
      ...(secondary.programmedArtists ?? []),
    ]),
    sources: dedupeSources([...(primary.sources ?? []), ...(secondary.sources ?? [])]),
  };
}

export function buildVenueOfficialPresenceSearchQueries(venue: VenueEnrichmentRequest): string[] {
  const name = venue.name.trim();
  const city = venue.city?.trim();
  const country = venue.country?.trim();
  const address = venue.address?.trim();
  const postalCode = venue.postalCode?.trim();
  const baseNameCity = [name, city].filter(Boolean).join(" ");
  const queries = [
    quoted([name, city]),
    `${quoted([baseNameCity])} officiel`,
    `${quoted([baseNameCity])} mairie`,
    `${quoted([baseNameCity])} salle`,
    `${quoted([baseNameCity])} réservation`,
    address ? quoted([name, address]) : null,
    postalCode ? quoted([name, postalCode]) : null,
  ];

  if (isFrance(country)) {
    queries.push(
      `${quoted([name])} ${quoted([city])} mairie`,
      `${quoted([name])} ${quoted([city])} site officiel`,
      `${quoted([name])} ${quoted([city])} commune`,
      `${quoted([name])} ${quoted([city])} culture`,
      `${quoted([name])} ${quoted([city])} programmation`,
    );
  }

  const officialDomain = findLikelyMunicipalityDomain(venue);
  if (officialDomain) {
    queries.push(`site:${officialDomain} ${quoted([name])}`);
  }

  return dedupeStrings(queries.flatMap((query) => query ?? []).filter((query) => !isGenericVenueOnlyQuery(query)));
}

export function isRejectedOfficialVenueUrl(url: string): boolean {
  const parsed = safeUrl(url);
  if (!parsed) return true;
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const path = parsed.pathname.toLowerCase();
  const blockedHosts = [
    "ticketmaster.",
    "bandsintown.",
    "songkick.",
    "seetickets.",
    "see-tickets.",
    "eventbrite.",
    "dice.fm",
    "fnacspectacles.",
    "fnac.com",
    "jondi.",
    "shotgun.live",
    "billetweb.",
    "weezevent.",
    "facebook.com/events",
    "google.",
  ];
  if (blockedHosts.some((blocked) => host.includes(blocked) || `${host}${path}`.includes(blocked))) return true;

  const directorySignals = [
    "tripadvisor.",
    "yelp.",
    "mapcarta.",
    "kompass.",
    "petitfute.",
    "tourisme",
    "agenda-culturel.",
    "infoconcert.",
    "concertandco.",
    "concerts-metal.",
    "concerts50.",
    "concertarchives.",
    "razibus.",
  ];
  if (directorySignals.some((blocked) => host.includes(blocked))) return true;

  return /\/(agenda|event|events|concert|concerts|billetterie|ticket|tickets)\/[^/]*(concert|festival|tour|live|billet|ticket|show)[^/]*\/?$/i.test(path);
}

export function validateOfficialVenueSelection(
  venue: VenueEnrichmentRequest,
  enrichment: VenueEnrichment,
): VenueEnrichment {
  const officialUrl = nullableHttpUrl(enrichment.officialUrl);
  if (!officialUrl || isRejectedOfficialVenueUrl(officialUrl)) {
    return { ...emptyVenueEnrichment(), officialUrl: null, enrichmentSource: enrichment.enrichmentSource ?? "openai_web_search" };
  }

  const confidence = clampConfidenceNumber(enrichment.officialUrlConfidence ?? 0);
  if (confidence < 0.8) {
    return { ...emptyVenueEnrichment(), officialUrl: null, enrichmentSource: enrichment.enrichmentSource ?? "openai_web_search" };
  }

  const text = [
    officialUrl,
    enrichment.officialName,
    enrichment.officialOrganizationName,
    ...((enrichment.sources ?? []).map((source) => `${source.title ?? ""} ${source.url}`)),
  ].join(" ");
  if (!candidateMatchesVenueIdentity(venue, officialUrl, text)) {
    return { ...emptyVenueEnrichment(), officialUrl: null, enrichmentSource: enrichment.enrichmentSource ?? "openai_web_search" };
  }

  return {
    ...enrichment,
    officialUrl,
    officialUrlType: normalizeOfficialUrlType(enrichment.officialUrlType),
    officialUrlConfidence: confidence,
    enrichmentSource: enrichment.enrichmentSource ?? "openai_web_search",
  };
}

function validateExtractedOfficialPresence(
  venue: VenueEnrichmentRequest,
  enrichment: VenueEnrichment,
): VenueEnrichment {
  if (!enrichment.officialUrl) return enrichment;
  const validated = validateOfficialVenueSelection(venue, enrichment);
  return {
    ...enrichment,
    officialUrl: validated.officialUrl,
    officialUrlType: validated.officialUrlType,
    officialOrganizationName: validated.officialOrganizationName,
    officialUrlConfidence: validated.officialUrlConfidence,
    website: validated.officialUrlType === "venue" || validated.officialUrlType === "operator"
      ? enrichment.website ?? validated.officialUrl
      : enrichment.website ?? null,
  };
}

async function scrapeOfficialVenuePages(venue: VenueEnrichmentRequest): Promise<ScrapedVenuePage[]> {
  if (!venue.website) return [];
  const provider = await getWebExtractProvider();
  if (!provider) return [];

  const urls = buildVenueScrapeUrls(venue.website);
  const pages: ScrapedVenuePage[] = [];

  for (const url of urls) {
    if (pages.length >= 6) break;
    try {
      const result = await provider.extract(url, { timeoutMs: 8_000 });
      const text = [result?.title, result?.text, result?.markdown].filter(Boolean).join("\n").trim();
      if (result && text.length >= 80) {
        pages.push({ url: result.url, title: result.title ?? null, text: compactText(text, 5_000) });
      }
    } catch {
      // Best-effort enrichment: failed pages do not block the venue detail.
    }
  }

  return pages;
}

async function getWebExtractProvider(): Promise<{ extract: (url: string, options?: { timeoutMs?: number }) => Promise<{ url: string; title: string | null; text: string | null; markdown: string | null } | null> } | null> {
  try {
    const module = await import("../../../../dist/providers/web/providers.js");
    return module.buildDefaultWebExtractProvider(process.env);
  } catch {
    return null;
  }
}

async function discoverOfficialVenuePresence(
  venue: VenueEnrichmentRequest,
  current: VenueEnrichment,
): Promise<VenueEnrichment> {
  const knownWebsite = nullableHttpUrl(current.website ?? venue.website);
  if (knownWebsite && !isRejectedOfficialVenueUrl(knownWebsite)) {
    return officialPresenceFromExistingWebsite(venue, knownWebsite);
  }

  const provider = await getWebSearchProvider();
  if (!provider) return emptyVenueEnrichment();

  const candidates: VenueOfficialPresenceCandidate[] = [];
  for (const query of buildVenueOfficialPresenceSearchQueries(venue).slice(0, 10)) {
    try {
      const results = await provider.search(query, { limit: 5, timeoutMs: 12_000 });
      for (const result of results) {
        const url = nullableHttpUrl(result.url);
        if (!url || isRejectedOfficialVenueUrl(url)) continue;
        candidates.push({
          title: result.title ?? null,
          url,
          snippet: result.snippet ?? result.markdown ?? null,
          sourceProvider: result.sourceProvider,
          confidence: result.confidence,
          query,
        });
      }
    } catch {
      // Best-effort official URL discovery: one failed query does not block the detail page.
    }
  }

  const deduped = dedupeOfficialPresenceCandidates(candidates).slice(0, 20);
  if (deduped.length === 0) return emptyVenueEnrichment();

  const selected = process.env.OPENAI_API_KEY
    ? await selectOfficialVenuePresenceWithOpenAI(venue, deduped)
    : selectOfficialVenuePresenceHeuristically(venue, deduped);
  return validateOfficialVenueSelection(venue, selected);
}

async function getWebSearchProvider(): Promise<{ search: (query: string, options?: { limit?: number; timeoutMs?: number }) => Promise<Array<{ title: string | null; url: string | null; snippet: string | null; markdown?: string | null; sourceProvider: string; confidence: number }>> } | null> {
  try {
    const module = await import("../../../../dist/providers/web/providers.js");
    const bookingProviders = module.getEnabledBookingSearchProviders?.(process.env) ?? [];
    return bookingProviders[0] ?? module.buildDefaultWebSearchProvider(process.env);
  } catch {
    return null;
  }
}

async function selectOfficialVenuePresenceWithOpenAI(
  venue: VenueEnrichmentRequest,
  candidates: VenueOfficialPresenceCandidate[],
): Promise<VenueEnrichment> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_VENUE_OFFICIAL_URL_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      temperature: 0,
      messages: [
        { role: "system", content: officialPresenceSelectionPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            venue: {
              name: venue.name,
              city: venue.city ?? null,
              country: venue.country ?? null,
              address: venue.address ?? null,
              postalCode: venue.postalCode ?? null,
              region: venue.region ?? null,
              type: venue.venueType ?? venue.venueTypeLabel ?? null,
              sourceUrl: venue.sourceUrl ?? null,
            },
            candidates,
          }),
        },
      ],
      response_format: venueEnrichmentResponseFormat(),
    });
    return validateOfficialVenueSelection(venue, parseVenueEnrichmentJson(response.choices[0]?.message?.content));
  } catch {
    return selectOfficialVenuePresenceHeuristically(venue, candidates);
  }
}

function selectOfficialVenuePresenceHeuristically(
  venue: VenueEnrichmentRequest,
  candidates: VenueOfficialPresenceCandidate[],
): VenueEnrichment {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreOfficialPresenceCandidate(venue, candidate),
    }))
    .filter((entry) => entry.score >= 0.8)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return emptyVenueEnrichment();
  const type = classifyOfficialUrlType(venue, best.candidate.url);
  return {
    officialUrl: best.candidate.url,
    officialUrlType: type,
    officialOrganizationName: type === "municipality" && venue.city ? `Mairie de ${venue.city}` : null,
    officialUrlConfidence: Math.min(0.95, best.score),
    website: type === "venue" || type === "operator" ? best.candidate.url : null,
    enrichmentSource: "web_search",
    sources: [{
      url: best.candidate.url,
      title: best.candidate.title,
      type,
      fields: ["officialUrl", "officialUrlType", "officialUrlConfidence"],
    }],
    genres: [],
    otherSocialLinks: [],
    programmedArtists: [],
  };
}

function buildVenueScrapeUrls(website: string): string[] {
  try {
    const parsed = new URL(website);
    const origin = `${parsed.protocol}//${parsed.host}`;
    const base = parsed.pathname && parsed.pathname !== "/" ? parsed.toString() : origin;
    const paths = [
      "/",
      "/contact",
      "/agenda",
      "/events",
      "/programmation",
      "/programme",
      "/concerts",
      "/about",
      "/infos-pratiques",
      "/professionnels",
      "/booking",
    ];
    return dedupeStrings([base, ...paths.map((entry) => `${origin}${entry}`)]);
  } catch {
    return [website];
  }
}

async function extractVenueFromPagesWithOpenAI(
  venue: VenueEnrichmentRequest,
  pages: ScrapedVenuePage[],
): Promise<VenueEnrichment> {
  if (!process.env.OPENAI_API_KEY || pages.length === 0) return emptyVenueEnrichment();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const content = pages
    .map((page) => `SOURCE: ${page.url}\nTITLE: ${page.title ?? ""}\nCONTENT:\n${page.text}`)
    .join("\n\n---\n\n");

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_VENUE_ENRICHMENT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    temperature: 0,
    messages: [
      { role: "system", content: extractionSystemPrompt() },
      {
        role: "user",
        content: `Extract venue details for "${venue.name}". Use only the supplied sources. Known venue context: ${JSON.stringify(venue)}\n\n${compactText(content, 18_000)}`,
      },
    ],
    response_format: venueEnrichmentResponseFormat(),
  });

  return validateExtractedOfficialPresence(venue, parseVenueEnrichmentJson(response.choices[0]?.message?.content));
}

async function extractVenueWithOpenAIWebSearch(
  venue: VenueEnrichmentRequest,
  missingFields: string[],
): Promise<VenueEnrichment> {
  if (!process.env.OPENAI_API_KEY || missingFields.length === 0) return emptyVenueEnrichment();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const query = [
    venue.name,
    venue.city,
    venue.country,
    "official website",
    missingFields.join(", "),
  ].filter(Boolean).join(" ");

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_VENUE_WEB_SEARCH_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: venuePublicProfileSearchPrompt(),
        },
        {
          role: "user",
          content: `Find structured public information for this venue: ${venue.name}, ${[venue.city, venue.country].filter(Boolean).join(", ")}. It may have minor name variants. Return the best known official/public profile information: official name, short description, venue type, full address, city, country, official website, Facebook, Instagram, phone, booking/contact email if explicitly listed, typical genres, whether it programs live concerts, and source URLs. If no official website exists but Facebook or Instagram is the main official presence, return that as officialUrl with officialUrlType social. Missing fields requested by the app: ${missingFields.join(", ")}. Query context: ${query}. Known venue context: ${JSON.stringify(venue)}`,
        },
      ],
      tools: [{ type: "web_search_preview" }],
      text: { format: venueEnrichmentTextFormat() },
    } as never);
    return validateExtractedOfficialPresence(venue, parseVenueEnrichmentJson(response.output_text));
  } catch {
    return emptyVenueEnrichment();
  }
}

function extractionSystemPrompt(): string {
  return [
    "Extract structured venue information for Artist Radar.",
    "Use only information supported by the supplied/search sources.",
    "Never guess. Never infer or generate an email, URL, capacity, phone, contact person, or social account.",
    "Return null when unavailable and empty arrays when no supported list exists.",
    "Keep source URLs for every extracted field in sources[].fields.",
    "Do not replace a reliable official value with weaker third-party information.",
  ].join(" ");
}

function venuePublicProfileSearchPrompt(): string {
  return [
    "You are enriching a music venue profile.",
    "Use web search.",
    "Return only factual information supported by sources.",
    "Never invent address, website, social links, capacity, phone, image, email, or contact.",
    "Prefer official venue website and official social profiles.",
    "Reject unrelated venues, ticketing-only pages, event aggregators, blogs, and media articles as official sources.",
    "Third-party directories may support non-official facts like phone, address, genres, or live-music programming, but must not become officialUrl.",
    "If no official website exists but Facebook or Instagram is the main official presence, return that as officialUrl with officialUrlType social.",
  ].join(" ");
}

function officialPresenceSelectionPrompt(): string {
  return [
    "Find the best official web presence for this venue.",
    "Priority: 1. official venue website 2. official operator website/page 3. official municipality/local government page dedicated to the venue 4. official social media profile.",
    "Municipality pages are valid official sources when the venue is municipally owned or operated.",
    "Reject ticketing websites, event aggregators, directories, tourism directories, individual event pages, blogs, and media articles.",
    "Verify that the page refers to the correct venue and location using the venue name, city, country, address, postal code, and candidate snippets.",
    "Never invent an URL, organization, contact, capacity, email, or social account.",
    "If no candidate is sufficiently official and location-matched, return officialUrl null and officialUrlConfidence null.",
    "Return structured JSON only.",
  ].join(" ");
}

function venueEnrichmentResponseFormat() {
  return {
    type: "json_schema",
    json_schema: {
      name: "venue_enrichment",
      strict: true,
      schema: venueEnrichmentJsonSchema(),
    },
  } as const;
}

function venueEnrichmentTextFormat() {
  return {
    type: "json_schema",
    name: "venue_enrichment",
    strict: true,
    schema: venueEnrichmentJsonSchema(),
  } as const;
}

function venueEnrichmentJsonSchema() {
  const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
  const nullableInteger = { anyOf: [{ type: "integer" }, { type: "null" }] };
  const nullableBoolean = { anyOf: [{ type: "boolean" }, { type: "null" }] };
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "officialName",
      "officialUrl",
      "officialUrlType",
      "officialOrganizationName",
      "officialUrlConfidence",
      "enrichmentSource",
      "description",
      "type",
      "address",
      "city",
      "country",
      "capacity",
      "website",
      "programmingUrl",
      "contactUrl",
      "contactEmail",
      "bookingEmail",
      "bookingContactName",
      "phone",
      "instagram",
      "facebook",
      "otherSocialLinks",
      "genres",
      "programsLiveMusic",
      "booksEmergingArtists",
      "programmedArtists",
      "sources",
    ],
    properties: {
      officialName: nullableString,
      officialUrl: nullableString,
      officialUrlType: { anyOf: [{ enum: ["venue", "operator", "municipality", "social", "other"] }, { type: "null" }] },
      officialOrganizationName: nullableString,
      officialUrlConfidence: { anyOf: [{ type: "number", minimum: 0, maximum: 1 }, { type: "null" }] },
      enrichmentSource: nullableString,
      description: nullableString,
      type: nullableString,
      address: nullableString,
      city: nullableString,
      country: nullableString,
      capacity: nullableInteger,
      website: nullableString,
      programmingUrl: nullableString,
      contactUrl: nullableString,
      contactEmail: nullableString,
      bookingEmail: nullableString,
      bookingContactName: nullableString,
      phone: nullableString,
      instagram: nullableString,
      facebook: nullableString,
      otherSocialLinks: { type: "array", items: { type: "string" } },
      genres: { type: "array", items: { type: "string" } },
      programsLiveMusic: nullableBoolean,
      booksEmergingArtists: nullableBoolean,
      programmedArtists: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "eventUrl", "date"],
          properties: {
            name: { type: "string" },
            eventUrl: nullableString,
            date: nullableString,
          },
        },
      },
      sources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["url", "title", "type", "fields"],
          properties: {
            url: { type: "string" },
            title: nullableString,
            type: nullableString,
            fields: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
}

function parseVenueEnrichmentJson(content: string | null | undefined): VenueEnrichment {
  if (!content) return emptyVenueEnrichment();
  try {
    return normalizeVenueEnrichment(JSON.parse(content));
  } catch {
    return emptyVenueEnrichment();
  }
}

function normalizeVenueEnrichment(raw: unknown): VenueEnrichment {
  const data = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  return {
    officialName: nullableTrimmedString(data.officialName),
    officialUrl: nullableHttpUrl(data.officialUrl),
    officialUrlType: normalizeOfficialUrlType(data.officialUrlType),
    officialOrganizationName: nullableTrimmedString(data.officialOrganizationName),
    officialUrlConfidence: typeof data.officialUrlConfidence === "number" ? clampConfidenceNumber(data.officialUrlConfidence) : null,
    enrichmentSource: nullableTrimmedString(data.enrichmentSource),
    description: nullableTrimmedString(data.description),
    type: nullableTrimmedString(data.type),
    address: nullableTrimmedString(data.address),
    city: nullableTrimmedString(data.city),
    country: nullableTrimmedString(data.country),
    capacity: positiveIntegerOrNull(data.capacity),
    website: normalizeVenueWebsite(data.website),
    programmingUrl: nullableHttpUrl(data.programmingUrl),
    contactUrl: nullableHttpUrl(data.contactUrl),
    contactEmail: nullableEmail(data.contactEmail),
    bookingEmail: nullableEmail(data.bookingEmail),
    bookingContactName: nullableTrimmedString(data.bookingContactName),
    phone: nullableTrimmedString(data.phone),
    instagram: nullableHttpUrl(data.instagram),
    facebook: nullableHttpUrl(data.facebook),
    otherSocialLinks: Array.isArray(data.otherSocialLinks) ? data.otherSocialLinks.flatMap((value) => nullableHttpUrl(value) ?? []) : [],
    genres: Array.isArray(data.genres) ? dedupeStrings(data.genres.flatMap((value) => nullableTrimmedString(value) ?? [])) : [],
    programsLiveMusic: typeof data.programsLiveMusic === "boolean" ? data.programsLiveMusic : null,
    booksEmergingArtists: typeof data.booksEmergingArtists === "boolean" ? data.booksEmergingArtists : null,
    programmedArtists: Array.isArray(data.programmedArtists)
      ? data.programmedArtists.flatMap((value) => normalizeProgrammedArtist(value) ?? [])
      : [],
    sources: Array.isArray(data.sources) ? dedupeSources(data.sources.flatMap((value) => normalizeSource(value) ?? [])) : [],
  };
}

function baseVenueEnrichment(venue: VenueEnrichmentRequest): VenueEnrichment {
  const existingWebsite = nullableHttpUrl(venue.website);
  const reliableWebsite = existingWebsite && !isRejectedOfficialVenueUrl(existingWebsite)
    ? existingWebsite
    : null;
  return {
    officialName: venue.name,
    officialUrl: reliableWebsite,
    officialUrlType: reliableWebsite ? classifyOfficialUrlType(venue, reliableWebsite) : null,
    officialOrganizationName: reliableWebsite && classifyOfficialUrlType(venue, reliableWebsite) === "municipality" && venue.city
      ? `Mairie de ${venue.city}`
      : null,
    officialUrlConfidence: reliableWebsite ? 0.9 : null,
    enrichmentSource: reliableWebsite ? "existing_data" : null,
    description: null,
    type: specificVenueType(venue.venueTypeLabel ?? venue.venueType),
    address: venue.address ?? null,
    city: venue.city ?? null,
    country: venue.country ?? null,
    capacity: venue.capacity ?? null,
    website: reliableWebsite && ["venue", "operator"].includes(classifyOfficialUrlType(venue, reliableWebsite)) ? reliableWebsite : null,
    programmingUrl: null,
    contactUrl: null,
    contactEmail: looksLikeEmail(venue.contact) ? venue.contact : null,
    bookingEmail: null,
    bookingContactName: null,
    phone: venue.contact && !looksLikeEmail(venue.contact) && /^[+]?[\d\s().-]{6,}$/.test(venue.contact) ? venue.contact : null,
    instagram: null,
    facebook: null,
    otherSocialLinks: [],
    genres: [],
    programsLiveMusic: null,
    booksEmergingArtists: null,
    programmedArtists: [],
    sources: reliableWebsite ? [{ url: reliableWebsite, type: "existing_data", fields: ["officialUrl", "website"] }] : [],
  };
}

function emptyVenueEnrichment(): VenueEnrichment {
  return {
    officialUrl: null,
    officialUrlType: null,
    officialOrganizationName: null,
    officialUrlConfidence: null,
    sources: [],
    otherSocialLinks: [],
    genres: [],
    programsLiveMusic: null,
    programmedArtists: [],
  };
}

function normalizeVenueRequest(venue: VenueEnrichmentRequest): VenueEnrichmentRequest {
  return {
    ...venue,
    id: venue.id.trim(),
    name: venue.name.trim(),
    website: nullableHttpUrl(venue.website),
    address: nullableTrimmedString(venue.address),
    postalCode: nullableTrimmedString(venue.postalCode),
    region: nullableTrimmedString(venue.region),
    city: nullableTrimmedString(venue.city),
    country: nullableTrimmedString(venue.country),
    capacity: positiveIntegerOrNull(venue.capacity),
    contact: nullableTrimmedString(venue.contact),
    venueType: nullableTrimmedString(venue.venueType),
    venueTypeLabel: nullableTrimmedString(venue.venueTypeLabel),
    sourceUrl: nullableHttpUrl(venue.sourceUrl),
    sourceUrls: Array.isArray(venue.sourceUrls) ? dedupeStrings(venue.sourceUrls.flatMap((url) => nullableHttpUrl(url) ?? [])) : [],
  };
}

function normalizeProgrammedArtist(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const name = nullableTrimmedString(raw.name);
  if (!name) return null;
  return {
    name,
    eventUrl: nullableHttpUrl(raw.eventUrl),
    date: nullableTrimmedString(raw.date),
  };
}

function normalizeSource(value: unknown): VenueEnrichmentSource | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const url = nullableHttpUrl(raw.url);
  if (!url) return null;
  const fields = Array.isArray(raw.fields) ? dedupeStrings(raw.fields.flatMap((field) => nullableTrimmedString(field) ?? [])) : [];
  return {
    url,
    title: nullableTrimmedString(raw.title),
    type: nullableTrimmedString(raw.type),
    fields,
  };
}

function firstText(a?: string | null, b?: string | null): string | null {
  return nullableTrimmedString(a) ?? nullableTrimmedString(b);
}

function specificVenueType(value?: string | null): string | null {
  const type = nullableTrimmedString(value);
  return type && !/^(venue|lieu|salle)$/i.test(type) ? type : null;
}

function firstUrl(a?: string | null, b?: string | null): string | null {
  return nullableHttpUrl(a) ?? nullableHttpUrl(b);
}

function firstOfficialUrl(primary: VenueEnrichment, secondary: VenueEnrichment): string | null {
  return nullableHttpUrl(primary.officialUrl) ?? nullableHttpUrl(secondary.officialUrl);
}

function nullableTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableHttpUrl(value: unknown): string | null {
  const trimmed = nullableTrimmedString(value);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeVenueWebsite(value: unknown): string | null {
  const normalized = nullableHttpUrl(value);
  if (!normalized || isRejectedOfficialVenueUrl(normalized)) return null;
  const parsed = new URL(normalized);
  if (/^\/(infos?|contact|booking|programme|programmation|agenda)(\/|$)/i.test(parsed.pathname)) {
    return `${parsed.origin}/`;
  }
  return normalized;
}

function nullableEmail(value: unknown): string | null {
  const text = nullableTrimmedString(value);
  return looksLikeEmail(text) ? text : null;
}

function looksLikeEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function positiveIntegerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function needsOfficialPresenceSearch(enrichment: VenueEnrichment): boolean {
  const officialUrl = nullableHttpUrl(enrichment.officialUrl ?? enrichment.website);
  return !officialUrl || isRejectedOfficialVenueUrl(officialUrl);
}

function officialPresenceFromExistingWebsite(venue: VenueEnrichmentRequest, url: string): VenueEnrichment {
  const type = classifyOfficialUrlType(venue, url);
  return {
    officialUrl: url,
    officialUrlType: type,
    officialOrganizationName: type === "municipality" && venue.city ? `Mairie de ${venue.city}` : null,
    officialUrlConfidence: 0.9,
    website: type === "venue" || type === "operator" ? url : null,
    enrichmentSource: "existing_data",
    sources: [{ url, type: "existing_data", fields: ["officialUrl", "officialUrlType", "officialUrlConfidence"] }],
    genres: [],
    otherSocialLinks: [],
    programmedArtists: [],
  };
}

function dedupeOfficialPresenceCandidates(candidates: VenueOfficialPresenceCandidate[]): VenueOfficialPresenceCandidate[] {
  const byUrl = new Map<string, VenueOfficialPresenceCandidate>();
  for (const candidate of candidates) {
    const url = nullableHttpUrl(candidate.url);
    if (!url || byUrl.has(url)) continue;
    byUrl.set(url, { ...candidate, url });
  }
  return [...byUrl.values()];
}

function scoreOfficialPresenceCandidate(venue: VenueEnrichmentRequest, candidate: VenueOfficialPresenceCandidate): number {
  if (isRejectedOfficialVenueUrl(candidate.url)) return 0;
  const url = safeUrl(candidate.url);
  if (!url) return 0;
  const haystack = normalizeForMatch([candidate.url, candidate.title, candidate.snippet].filter(Boolean).join(" "));
  const host = normalizeForMatch(url.hostname.replace(/^www\./, ""));
  const city = normalizeForMatch(venue.city ?? "");
  const nameTokens = significantTokens(venue.name);
  const cityMatched = city && (haystack.includes(city) || host.includes(city.replace(/\s+/g, "")));
  const addressMatched = venue.address ? haystack.includes(normalizeForMatch(venue.address)) : false;
  const postalMatched = venue.postalCode ? haystack.includes(normalizeForMatch(venue.postalCode)) : false;
  const nameMatches = nameTokens.filter((token) => haystack.includes(token) || host.includes(token)).length;
  const type = classifyOfficialUrlType(venue, candidate.url);

  let score = 0.25;
  score += Math.min(0.3, nameMatches * 0.12);
  if (cityMatched) score += 0.25;
  if (addressMatched || postalMatched) score += 0.15;
  if (type === "venue") score += 0.2;
  if (type === "operator") score += 0.16;
  if (type === "municipality") score += 0.14;
  if (type === "social") score += 0.06;
  if (candidate.confidence >= 0.75) score += 0.05;
  if (!candidateMatchesVenueIdentity(venue, candidate.url, haystack)) score -= 0.35;
  return clampConfidenceNumber(score);
}

function candidateMatchesVenueIdentity(venue: VenueEnrichmentRequest, url: string, text: string): boolean {
  const parsed = safeUrl(url);
  if (!parsed) return false;
  const haystack = normalizeForMatch(`${url} ${text}`);
  const host = normalizeForMatch(parsed.hostname.replace(/^www\./, ""));
  const city = normalizeForMatch(venue.city ?? "");
  const nameTokens = significantTokens(venue.name);
  const hasNameSignal = nameTokens.length === 0 || nameTokens.some((token) => haystack.includes(token) || host.includes(token));
  const hasLocationSignal = Boolean(
    !city ||
    haystack.includes(city) ||
    host.includes(city.replace(/\s+/g, "")) ||
    (venue.postalCode && haystack.includes(normalizeForMatch(venue.postalCode))) ||
    (venue.address && haystack.includes(normalizeForMatch(venue.address))),
  );
  return hasNameSignal && hasLocationSignal;
}

function classifyOfficialUrlType(venue: VenueEnrichmentRequest, url: string): VenueOfficialUrlType {
  const parsed = safeUrl(url);
  if (!parsed) return "other";
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const city = normalizeForDomain(venue.city ?? "");
  const venueTokens = significantTokens(venue.name).map(normalizeForDomain);
  if (host.includes("facebook.") || host.includes("instagram.")) return "social";
  if (city && (host === `${city}.fr` || host.includes(`mairie-${city}`) || host.includes(`${city}.fr`) || host.includes(`ville-${city}`))) {
    return "municipality";
  }
  if (host.includes("mairie") || host.includes("ville-") || host.endsWith(".gouv.fr")) return "municipality";
  if (venueTokens.some((token) => token.length >= 4 && host.includes(token))) return "venue";
  return "operator";
}

function normalizeOfficialUrlType(value: unknown): VenueOfficialUrlType | null {
  return value === "venue" || value === "operator" || value === "municipality" || value === "social" || value === "other"
    ? value
    : null;
}

function quoted(values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => `"${value.trim()}"`)
    .join(" ");
}

function isGenericVenueOnlyQuery(query: string): boolean {
  return /^"?salle (polyvalente|des fêtes|municipale)"?$/i.test(query.trim());
}

function isFrance(country?: string | null): boolean {
  return normalizeForMatch(country ?? "") === "france" || normalizeForMatch(country ?? "") === "fr";
}

function findLikelyMunicipalityDomain(venue: VenueEnrichmentRequest): string | null {
  const city = normalizeForDomain(venue.city ?? "");
  if (!city || !isFrance(venue.country)) return null;
  return `${city}.fr`;
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function significantTokens(value: string): string[] {
  const stopWords = new Set(["le", "la", "les", "de", "du", "des", "d", "salle", "polyvalente", "fetes", "fête", "the", "and"]);
  return normalizeForMatch(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeForDomain(value: string): string {
  return normalizeForMatch(value).replace(/\s+/g, "-");
}

function clampConfidenceNumber(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function dedupeProgrammedArtists(values: NonNullable<VenueEnrichment["programmedArtists"]>): NonNullable<VenueEnrichment["programmedArtists"]> {
  const seen = new Set<string>();
  return values.filter((artist) => {
    const key = `${artist.name.toLowerCase()}|${artist.eventUrl ?? ""}|${artist.date ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeSources(values: VenueEnrichmentSource[]): VenueEnrichmentSource[] {
  const byUrl = new Map<string, VenueEnrichmentSource>();
  for (const source of values) {
    const url = nullableHttpUrl(source.url);
    if (!url) continue;
    const existing = byUrl.get(url);
    byUrl.set(url, {
      url,
      title: existing?.title ?? source.title ?? null,
      type: existing?.type ?? source.type ?? null,
      fields: dedupeStrings([...(existing?.fields ?? []), ...(source.fields ?? [])]),
    });
  }
  return [...byUrl.values()];
}

function compactText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? compact.slice(0, maxLength) : compact;
}
