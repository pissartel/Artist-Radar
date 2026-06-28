// Legacy component types — kept for existing components
export interface Artist {
  name: string;
  genre: string;
  city: string;
  score?: number;
}

export interface KPICard {
  label: string;
  value: string | number;
}

// Dashboard API-aligned types
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

export type BookingOpportunityType =
  | "venue"
  | "festival"
  | "concert"
  | "opening_slot";

export interface MatchReason {
  label: string;
  detail?: string;
}

export interface BookingOpportunity {
  id: string;
  title: string;
  type: BookingOpportunityType;
  location: string;
  city?: string;
  country?: string;
  description: string;
  tags: string[];
  matchScore: number;
  matchReasons: string[];
  source?: string;
  imageUrl?: string;
}

export interface BookingSource {
  id: string;
  name: string;
  url?: string;
  type: string;
}

export interface CityOpportunityStat {
  city: string;
  country: string;
  opportunityCount: number;
  topVenueCount: number;
}

export interface DashboardData {
  artist: ArtistProfile;
  kpis: KpiMetric[];
  similarArtists: SimilarArtist[];
  bookingOpportunities: BookingOpportunity[];
  topCities: CityOpportunityStat[];
  sources: BookingSource[];
}
