import type { ArtistProfile, ArtistTier } from "../schemas.js";

export type BookingTargetCategory =
  | "venue"
  | "bar"
  | "association"
  | "collective"
  | "festival"
  | "springboard"
  | "open_call"
  | "promoter"
  | "booking_agency"
  | "live_producer"
  | "event";

export type BookingSourceType =
  | "official_site"
  | "event_page"
  | "local_agenda"
  | "festival_page"
  | "open_call_page"
  | "social_profile"
  | "search_result"
  | "manual_seed"
  | "openagenda"
  | "mock";

export type ContactCandidateType = "email" | "contact_form" | "social" | "phone" | "unknown";

export interface BookingSearchInput {
  artist: string;
  city: string;
  genre: string;
  target?: string | null;
  links: string[];
  limit: number;
  artistProfile?: ArtistProfile | null;
}

export interface ContactCandidate {
  type: ContactCandidateType;
  value: string | null;
  sourceUrl: string | null;
  confidence: number;
  notes?: string;
}

export interface BookingTarget {
  name: string;
  category: BookingTargetCategory;
  city: string | null;
  country: string | null;
  description?: string | null;
  sourceUrl: string | null;
  sourceType: BookingSourceType;
  genres: string[];
  estimatedCapacity?: number | null;
  estimatedArtistTier?: ArtistTier | null;
  pastProgramming?: string[];
  eventDate?: string | null;
  deadline?: string | null;
  recommendedAction?: BookingSuggestedAction | null;
  contacts: ContactCandidate[];
  confidence: number;
  evidence: string[];
}

export interface BookingSourceMetadata {
  providerName: string;
  sourceProvider: string;
  searchedQueries: string[];
  targetCount: number;
  warnings: string[];
  metadata: Record<string, unknown>;
}

export type BookingSuggestedAction = "headline_slot" | "support_slot" | "application" | "booking_contact" | "research";

export interface RawBookingSource {
  name: string;
  category?: BookingTargetCategory;
  title?: string | null;
  url?: string | null;
  sourceUrl?: string | null;
  sourceType?: BookingSourceType;
  city?: string | null;
  country?: string | null;
  text?: string | null;
  snippet?: string | null;
  links?: string[];
  genres?: string[];
  estimatedCapacity?: number | null;
  contacts?: ContactCandidate[];
  confidence?: number;
  eventDate?: string | null;
  deadline?: string | null;
}

export interface BookingScore {
  total: number;
  confidence: number;
  genreFit: number;
  sizeFit: number;
  pastProgrammingFit: number;
  supportSlotPotential: number;
  locationFit: number;
  contactability: number;
  sourceConfidence: number;
  reason: string;
  warnings: string[];
}

export interface BookingOpportunity {
  name: string;
  type: string;
  category: BookingTargetCategory;
  city: string | null;
  country: string | null;
  sourceUrl: string | null;
  contact: string | null;
  contactType: ContactCandidateType;
  score: number;
  confidence: number;
  reason: string;
  warnings: string[];
  fitSummary: string;
  evidence: string[];
  suggestedAction: string;
  target: BookingTarget;
  bookingScore: BookingScore;
}

export interface BookingSearchResult {
  input: BookingSearchInput;
  targets: BookingTarget[];
  opportunities: BookingOpportunity[];
  sourcesUsed: string[];
  warnings: string[];
  sourceMetadata: BookingSourceMetadata[];
}
