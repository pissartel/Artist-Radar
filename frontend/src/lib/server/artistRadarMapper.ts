import type {
  ArtistMetrics,
  ArtistProfile,
  BookingSource,
  CityOpportunityStat,
  KpiMetric,
  Opportunity,
  OpportunityCategory,
  OpportunityType,
  ArtistTier,
  SimilarArtist,
} from "@/types";
import type { ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";
import type {
  BackendArtistProfile,
  BackendArtistTier,
  BackendOpportunity,
  BackendPipelineResult,
  BackendSimilarArtist,
} from "./backendTypes";

// "unknown" is intentionally absent: an unresolved tier must never be
// displayed as if it were the smallest known tier (issue #201 root cause —
// this exact mapping was why blink-182, whose size signals were sparse,
// rendered as "Emerging" instead of showing no scale claim at all). See
// mapSimilarArtist below, which omits `artistTier` entirely when the
// backend value is "unknown" rather than falling back into this map.
const ARTIST_TIER_MAP: Record<Exclude<BackendArtistTier, "unknown">, ArtistTier> = {
  small: "emerging",
  medium: "rising",
  large: "established",
};

const OPPORTUNITY_TYPE_MAP: Record<string, OpportunityType> = {
  festival: "festival",
  venue: "venue",
  bar: "venue",
  event: "concert",
  concert: "concert",
  opening_slot: "opening_slot",
  support_slot: "opening_slot",
  association: "organization",
  collective: "organization",
  promoter: "organization",
  booking_agency: "organization",
  live_producer: "organization",
  springboard: "organization",
  open_call: "organization",
};

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return slug || "unknown";
}

// A city is never literally the same string as its own country (e.g. a
// source that only knows the country reports it as both). When that
// happens, show the country alone rather than "France, France".
function joinLocation(city?: string | null, country?: string | null): string {
  const dedupedCity = city && country && city.trim().toLowerCase() === country.trim().toLowerCase() ? null : city;
  return [dedupedCity, country].filter((part): part is string => Boolean(part)).join(", ");
}

function mapArtistProfile(profile: BackendArtistProfile, request: ArtistRadarRequest): ArtistProfile {
  const name = profile.artistName ?? request.artistName;
  const city = profile.city ?? request.location;
  const country = profile.country ?? "";
  const genres = profile.genres.length > 0 ? profile.genres : [request.genre];
  const spotifyUrl = profile.spotify?.url ?? profile.socialLinks.spotifyUrl;

  const platforms: ArtistProfile["platforms"] = [];
  if (spotifyUrl) {
    platforms.push({ type: "spotify", url: spotifyUrl });
  }
  if (profile.socialLinks.instagramUrl) {
    platforms.push({ type: "instagram", url: profile.socialLinks.instagramUrl });
  }
  if (profile.socialLinks.youtubeUrl) {
    platforms.push({ type: "youtube", url: profile.socialLinks.youtubeUrl });
  }

  return {
    id: slugify(name),
    name,
    genres,
    location: joinLocation(city, country) || city,
    city,
    country,
    monthlyListeners: profile.spotify?.followers ?? profile.platformStats.spotifyFollowers ?? 0,
    growthPercent: 0,
    imageUrl: profile.imageUrl ?? undefined,
    imageSource: profile.imageSource ?? null,
    imageConfidence: profile.imageConfidence ?? null,
    platforms,
    spotify: profile.spotify ?? undefined,
    metrics: mapArtistMetrics(profile, genres),
  };
}

// Spotify's public API does not expose monthly listener counts, so that
// field stays null rather than being inferred from followers.
function mapArtistMetrics(profile: BackendArtistProfile, genres: string[]): ArtistMetrics {
  return {
    monthlyListeners: null,
    followers: profile.platformStats.spotifyFollowers ?? null,
    popularityScore: profile.platformStats.spotifyPopularity ?? null,
    mainGenre: genres[0] ?? null,
    spotifyUrl: profile.socialLinks.spotifyUrl ?? null,
  };
}

function mapSimilarArtist(artist: BackendSimilarArtist): SimilarArtist {
  const spotifyUrl = artist.spotify?.url ?? artist.spotifyUrl ?? undefined;
  const platforms: SimilarArtist["platforms"] = spotifyUrl ? [{ type: "spotify", url: spotifyUrl }] : [];

  return {
    id: slugify(artist.name),
    name: artist.name,
    genres: artist.genres,
    location: joinLocation(artist.city, artist.country),
    // Overall/booking relevance (issue #48) — must always be labeled
    // "Overall relevance" wherever shown, never presented as the Chartmetric
    // commercial-scale match (issue #201).
    matchScore: artist.totalRelevance,
    musicalMatchScore: artist.genreRelevance,
    reason: artist.reason,
    // "unknown" intentionally has no entry in ARTIST_TIER_MAP — omit the
    // field entirely rather than mislabel an unresolved tier.
    artistTier: artist.artistTier === "unknown" ? undefined : ARTIST_TIER_MAP[artist.artistTier],
    platforms,
    imageUrl: artist.imageUrl ?? undefined,
    imageSource: artist.imageSource ?? null,
    imageConfidence: artist.imageConfidence ?? null,
    monthlyListeners: artist.spotify?.followers ?? artist.estimatedFollowers ?? undefined,
    spotify: artist.spotify ?? undefined,
    commercialTier: artist.commercialTier,
    commercialAbsoluteScale: artist.commercialAbsoluteScale,
    commercialScore: artist.commercialScore,
    commercialScoreCoverage: artist.commercialScoreCoverage,
    commercialScoreConfidence: artist.commercialScoreConfidence,
    commercialScoreBreakdown: artist.commercialScoreBreakdown,
    commercialScoreExplanation: artist.commercialScoreExplanation,
    chartmetricDiagnostics: artist.chartmetricDiagnostics,
  };
}

function mapOpportunityType(type: string): OpportunityType {
  return OPPORTUNITY_TYPE_MAP[type] ?? "opening_slot";
}

// Direct hits from the backend's free-text `type` field. Kept separate from
// OPPORTUNITY_TYPE_MAP since it also recognizes support-slot type values.
const OPPORTUNITY_TYPE_CATEGORY_MAP: Record<string, OpportunityCategory> = {
  festival: "festival",
  venue: "venue",
  bar: "venue",
  club: "venue",
  event: "concert",
  concert: "concert",
  gig: "concert",
  show: "concert",
  opening_slot: "opening_slot",
  support_slot: "opening_slot",
  association: "organization",
  collective: "organization",
  promoter: "organization",
  booking_agency: "organization",
  live_producer: "organization",
  springboard: "organization",
  open_call: "organization",
};

const FESTIVAL_TEXT_SIGNAL = "festival";

const OPENING_SLOT_TEXT_SIGNALS = [
  "support slot",
  "support-slot",
  "opening act",
  "opening slot",
  "first part",
];

function mapOpportunityCategory(opportunity: BackendOpportunity): OpportunityCategory {
  const type = opportunity.type.trim().toLowerCase();
  const directMatch = OPPORTUNITY_TYPE_CATEGORY_MAP[type];
  if (directMatch) return directMatch;

  const text = [opportunity.name, opportunity.reason, opportunity.suggested_message]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  if (text.includes(FESTIVAL_TEXT_SIGNAL)) return "festival";
  if (OPENING_SLOT_TEXT_SIGNALS.some((signal) => text.includes(signal))) return "opening_slot";
  if (opportunity.contact) return "contact";
  return "unknown";
}

// Domains that are always an aggregator/discovery source, never a venue's
// own official site (PR #218 review feedback): a concert found through one
// of these must never be surfaced as "the venue's website". Includes the
// backend's own isSocialOrTicketingUrl domains (src/booking/
// eventPageExtraction.ts) — a social-media post about a show at a venue is
// never that venue's own site either, same reasoning as a ticketing link.
const NON_VENUE_WEBSITE_DOMAINS = [
  "songkick.com",
  "bandsintown.com",
  "setlist.fm",
  "shotgun.live",
  "dice.fm",
  "ra.co",
  "residentadvisor.net",
  "ticketmaster.com",
  "ticketmaster.fr",
  "eventbrite.com",
  "eventbrite.fr",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "last.fm",
  "allevents.in",
  "wegow.com",
];

// Path segments identifying an artist profile, event listing, calendar, or
// ticketing page rather than a venue's own homepage (PR #218 review
// feedback: "ne jamais mapper une page artiste, un calendrier artiste, une
// billetterie de concert, une page événement ou une source d'agrégateur
// vers venueWebsite").
const NON_VENUE_WEBSITE_PATH_PATTERN = /\/(artists?|events?|calendar|tickets?|billetterie|billets|e|tour)(\/|$)/i;

function isLikelyVenueWebsite(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    if (NON_VENUE_WEBSITE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return false;
    }
    return !NON_VENUE_WEBSITE_PATH_PATTERN.test(parsed.pathname);
  } catch {
    return false;
  }
}

// A venue's own official website is only ever the opportunity's own source
// when the opportunity IS the venue (its source page is the venue's site,
// not a third-party event/listing page) — never inferred for concert/
// festival/opening_slot opportunities, whose source is the event page
// (issue #213: "Do not label a generic listing page as the venue website").
// Even for a venue-type opportunity, the source is validated first (PR #218
// review feedback): a similar-artist concert page (Songkick/Shotgun/
// Bandsintown artist, calendar, event or ticketing URL) must never be
// displayed as the venue's official website — if the source doesn't look
// like a venue's own homepage, no website is shown at all rather than a
// misleading one.
function mapVenueWebsite(opportunity: BackendOpportunity, category: OpportunityCategory): string | undefined {
  if (category !== "venue") return undefined;
  const sourceUrl = opportunity.source_url;
  return sourceUrl && isLikelyVenueWebsite(sourceUrl) ? sourceUrl : undefined;
}

function mapOpportunity(opportunity: BackendOpportunity): Opportunity {
  const category = mapOpportunityCategory(opportunity);
  const venueName = opportunity.venueName?.trim() || undefined;
  // Stable per-session id: two opportunities that resolve to the same venue
  // name + city/country link to the same canonical venue page. Absent
  // whenever no venue name was resolved (issue #213 acceptance criterion).
  const venueId = venueName ? slugify(`${venueName}-${opportunity.city ?? ""}-${opportunity.country ?? ""}`) : undefined;

  return {
    id: slugify(`${opportunity.name}-${opportunity.city ?? "unknown"}`),
    type: mapOpportunityType(opportunity.type),
    category,
    title: opportunity.displayTitle || opportunity.name,
    organizationType: category === "organization" ? opportunity.type : undefined,
    location: joinLocation(opportunity.city, opportunity.country) || "Location unknown",
    city: opportunity.city ?? undefined,
    country: opportunity.country ?? undefined,
    date: opportunity.date ?? undefined,
    description: opportunity.suggested_message,
    tags: [],
    matchScore: opportunity.score,
    matchReasons: [opportunity.reason],
    matchBreakdown: opportunity.matchBreakdown,
    supportSlotPotential: opportunity.supportSlotPotential ?? null,
    sourceUrls: opportunity.source_url ? [opportunity.source_url] : [],
    contact: opportunity.contact,
    ticketUrl: opportunity.ticketUrl ?? null,
    genres: opportunity.genres ?? [],
    venueCapacity: opportunity.venueCapacity ?? null,
    address: opportunity.address ?? undefined,
    venue: venueName,
    venueId,
    venueType: opportunity.venueType ?? undefined,
    venueWebsite: mapVenueWebsite(opportunity, category),
    venueImageUrl: opportunity.venueImageUrl ?? undefined,
    venueConfidence: opportunity.venueConfidence != null ? Math.round(opportunity.venueConfidence * 100) : null,
    recentEvents: opportunity.recentEvents ?? [],
    lineup: opportunity.lineup ?? [],
    relatedArtist: opportunity.relatedArtist ?? null,
    venueArtistEvidence: opportunity.venueArtistEvidence ?? [],
    imageUrl: opportunity.imageUrl ?? undefined,
  };
}

function buildKpis(similarArtists: SimilarArtist[], opportunities: Opportunity[]): KpiMetric[] {
  const venues = opportunities.filter((opportunity) => opportunity.type === "venue").length;
  const concerts = opportunities.filter(
    (opportunity) => opportunity.type === "concert" || opportunity.type === "opening_slot"
  ).length;
  const festivals = opportunities.filter((opportunity) => opportunity.type === "festival").length;
  const contactsFound = opportunities.filter((opportunity) => Boolean(opportunity.contact)).length;
  const avgMatchScore =
    opportunities.length > 0
      ? Math.round(opportunities.reduce((sum, opportunity) => sum + opportunity.matchScore, 0) / opportunities.length)
      : 0;

  return [
    { id: "compatible-venues", label: "Compatible Venues", value: venues },
    { id: "concerts-found", label: "Concerts Found", value: concerts },
    { id: "festivals", label: "Festivals", value: festivals },
    { id: "similar-artists", label: "Similar Artists", value: similarArtists.length },
    { id: "contacts-found", label: "Contacts Found", value: contactsFound },
    { id: "avg-match-score", label: "Avg Match Score", value: avgMatchScore, unit: "%" },
  ];
}

function buildTopCities(opportunities: Opportunity[]): CityOpportunityStat[] {
  const byCity = new Map<string, { country?: string; count: number }>();

  for (const opportunity of opportunities) {
    if (!opportunity.city) continue;
    const entry = byCity.get(opportunity.city) ?? { country: opportunity.country, count: 0 };
    entry.count += 1;
    byCity.set(opportunity.city, entry);
  }

  const total = opportunities.length || 1;

  return Array.from(byCity.entries())
    .map(([city, { country, count }]) => ({
      city,
      country: country ?? "",
      opportunityCount: count,
      topVenueCount: count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.opportunityCount - a.opportunityCount)
    .slice(0, 5);
}

function buildSources(result: BackendPipelineResult): BookingSource[] {
  const sourceMetadata = result.bookingSearch?.sourceMetadata ?? [];
  if (sourceMetadata.length > 0) {
    return sourceMetadata.map((source) => ({
      id: slugify(source.providerName),
      name: source.providerName,
      type: source.sourceProvider,
      opportunityCount: source.targetCount,
    }));
  }

  return (result.bookingSearch?.sourcesUsed ?? []).map((name) => ({
    id: slugify(name),
    name,
    type: "manual",
  }));
}

export function mapPipelineResultToArtistRadarResponse(
  result: BackendPipelineResult,
  request: ArtistRadarRequest
): ArtistRadarResponse {
  const includeBooking = request.enableBooking !== false;
  const similarArtists = Object.values(result.similarArtists).flat().map(mapSimilarArtist);
  const bookingOpportunities = includeBooking ? result.opportunities.map(mapOpportunity) : [];
  const warnings = includeBooking ? (result.bookingSearch?.warnings ?? []) : [];

  return {
    artist: mapArtistProfile(result.artistProfile, request),
    kpis: buildKpis(similarArtists, bookingOpportunities),
    similarArtists,
    bookingOpportunities,
    topCities: includeBooking ? buildTopCities(bookingOpportunities) : [],
    sources: includeBooking ? buildSources(result) : [],
    warnings,
  };
}
