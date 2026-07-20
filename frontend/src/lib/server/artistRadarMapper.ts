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

const ARTIST_TIER_MAP: Record<BackendArtistTier, ArtistTier> = {
  small: "emerging",
  medium: "rising",
  large: "established",
  unknown: "emerging",
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
  const spotifyUrl = artist.spotify?.url ?? undefined;
  const platforms: SimilarArtist["platforms"] = spotifyUrl ? [{ type: "spotify", url: spotifyUrl }] : [];

  return {
    id: slugify(artist.name),
    name: artist.name,
    genres: artist.genres,
    location: joinLocation(artist.city, artist.country),
    matchScore: artist.totalRelevance,
    reason: artist.reason,
    artistTier: ARTIST_TIER_MAP[artist.artistTier],
    platforms,
    imageUrl: artist.imageUrl ?? undefined,
    imageSource: artist.imageSource ?? null,
    imageConfidence: artist.imageConfidence ?? null,
    monthlyListeners: artist.spotify?.followers ?? artist.estimatedFollowers ?? undefined,
    spotify: artist.spotify ?? undefined,
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

function mapOpportunity(opportunity: BackendOpportunity): Opportunity {
  const category = mapOpportunityCategory(opportunity);
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
    sourceUrls: opportunity.source_url ? [opportunity.source_url] : [],
    contact: opportunity.contact,
    ticketUrl: opportunity.ticketUrl ?? null,
    genres: opportunity.genres ?? [],
    venueCapacity: opportunity.venueCapacity ?? null,
    recentEvents: opportunity.recentEvents ?? [],
    lineup: opportunity.lineup ?? [],
    relatedArtist: opportunity.relatedArtist ?? null,
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
