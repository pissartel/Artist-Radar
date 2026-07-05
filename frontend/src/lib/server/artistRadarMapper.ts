import type {
  ArtistProfile,
  BookingSource,
  CityOpportunityStat,
  KpiMetric,
  Opportunity,
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
};

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return slug || "unknown";
}

function joinLocation(city?: string | null, country?: string | null): string {
  return [city, country].filter((part): part is string => Boolean(part)).join(", ");
}

function mapArtistProfile(profile: BackendArtistProfile, request: ArtistRadarRequest): ArtistProfile {
  const name = profile.artistName ?? request.artistName;
  const city = profile.city ?? request.location;
  const country = profile.country ?? "";
  const genres = profile.genres.length > 0 ? profile.genres : [request.genre];

  const platforms: ArtistProfile["platforms"] = [];
  if (profile.socialLinks.spotifyUrl) {
    platforms.push({ type: "spotify", url: profile.socialLinks.spotifyUrl });
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
    monthlyListeners: profile.platformStats.spotifyFollowers ?? 0,
    growthPercent: 0,
    platforms,
  };
}

function mapSimilarArtist(artist: BackendSimilarArtist): SimilarArtist {
  return {
    id: slugify(artist.name),
    name: artist.name,
    genres: artist.genres,
    location: joinLocation(artist.city, artist.country),
    matchScore: artist.totalRelevance,
    reason: artist.reason,
    artistTier: ARTIST_TIER_MAP[artist.artistTier],
    monthlyListeners: artist.estimatedFollowers ?? undefined,
  };
}

function mapOpportunityType(type: string): OpportunityType {
  return OPPORTUNITY_TYPE_MAP[type] ?? "opening_slot";
}

function mapOpportunity(opportunity: BackendOpportunity): Opportunity {
  return {
    id: slugify(`${opportunity.name}-${opportunity.city ?? "unknown"}`),
    type: mapOpportunityType(opportunity.type),
    title: opportunity.name,
    location: joinLocation(opportunity.city, opportunity.country) || "Location unknown",
    city: opportunity.city ?? undefined,
    country: opportunity.country ?? undefined,
    description: opportunity.suggested_message,
    tags: [],
    matchScore: opportunity.score,
    matchReasons: [opportunity.reason],
    sourceUrls: opportunity.source_url ? [opportunity.source_url] : [],
    contact: opportunity.contact,
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

function buildMatchExplanations(opportunities: Opportunity[]): string[] {
  const reasons = opportunities.flatMap((opportunity) => opportunity.matchReasons);
  return Array.from(new Set(reasons)).slice(0, 6);
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
    matchExplanations: includeBooking ? buildMatchExplanations(bookingOpportunities) : [],
    warnings,
  };
}
