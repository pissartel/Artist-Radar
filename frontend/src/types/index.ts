// Dashboard API-aligned types
export type PlatformType = "spotify" | "instagram" | "youtube" | "website";

export interface Platform {
  type: PlatformType;
  url?: string;
}

export interface ArtistProfile {
  id: string;
  name: string;
  genres: string[];
  location: string;
  city: string;
  country: string;
  monthlyListeners: number;
  growthPercent: number;
  imageUrl?: string;
  verified?: boolean;
  platforms?: Platform[];
}

export interface KpiMetric {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
}

export interface SimilarArtist {
  id: string;
  name: string;
  genres: string[];
  location: string;
  matchScore: number;
}

// V1 scope: booking opportunities only.
// Future opportunity categories (not yet exposed in the UI):
// | "playlist"
// | "label"
// | "blog"
// | "creative_provider"
// | "mixing_engineer"
// | "video_director"
export type OpportunityType = "venue" | "concert" | "opening_slot" | "festival";

// Generic entity covering booking opportunities today and future artist
// growth opportunities (labels, playlists, creative providers, ...).
export interface Opportunity {
  id: string;
  type: OpportunityType;
  title: string;
  location: string;
  city?: string;
  country?: string;
  date?: string;
  description: string;
  tags: string[];
  matchScore: number;
  matchReasons: string[];
  sourceUrls?: string[];
  contact?: string | null;
  relatedSimilarArtistIds?: string[];
  imageUrl?: string;
}

export interface BookingSource {
  id: string;
  name: string;
  url?: string;
  type: string;
  opportunityCount?: number;
}

export interface CityOpportunityStat {
  city: string;
  country: string;
  opportunityCount: number;
  topVenueCount: number;
  percentage?: number;
}

export interface DashboardData {
  artist: ArtistProfile;
  kpis: KpiMetric[];
  similarArtists: SimilarArtist[];
  bookingOpportunities: Opportunity[];
  topCities: CityOpportunityStat[];
  sources: BookingSource[];
  matchExplanations: string[];
}
