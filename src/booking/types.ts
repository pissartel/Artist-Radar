import type { ArtistProfile, ArtistTier, SimilarArtist } from "../schemas.js";

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
  | "similar_artist_live_history"
  | "specialized_scene_agenda"
  | "venue_official_programming_page"
  | "festival_official_page"
  | "promoter_official_page"
  | "mock";

export type ContactCandidateType = "email" | "contact_form" | "social" | "phone" | "unknown";

export type DateConfidence = "verified" | "unclear";
export type OpportunityKind = "actionable" | "historical_signal";

export interface BookingSearchInput {
  artist: string;
  city: string;
  genre: string;
  target?: string | null;
  links: string[];
  limit: number;
  artistProfile?: ArtistProfile | null;
  similarArtists?: SimilarArtist[];
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
  sourceProvider?: string | null;
  genres: string[];
  estimatedCapacity?: number | null;
  estimatedArtistTier?: ArtistTier | null;
  pastProgramming?: string[];
  eventDate?: string | null;
  eventDateRange?: { start: string; end: string } | null;
  isFutureEvent?: boolean | null;
  isPastEvent?: boolean | null;
  dateConfidence?: DateConfidence | null;
  opportunityKind?: OpportunityKind | null;
  ageMonths?: number | null;
  deadline?: string | null;
  recommendedAction?: BookingSuggestedAction | null;
  derivedFromSimilarArtist?: DerivedFromSimilarArtist | null;
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
  sourceProvider?: string | null;
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
  derivedFromSimilarArtist?: DerivedFromSimilarArtist | null;
  deadline?: string | null;
}

export interface DerivedFromSimilarArtist {
  name: string;
  popularityComparison: string;
  matchedGenres: string[];
  sourceUrl: string | null;
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

export interface OpportunityInternalReview {
  needsReview: boolean;
  missingFields: string[];
  confidence: number;
}

export interface BookingOpportunity {
  name: string;
  rawTitle: string;
  displayTitle: string;
  summary: string;
  type: string;
  category: BookingTargetCategory;
  city: string | null;
  country: string | null;
  sourceUrl: string | null;
  sourceType: BookingSourceType;
  sourceProvider: string | null;
  contact: string | null;
  contactType: ContactCandidateType;
  score: number;
  confidence: number;
  reason: string;
  warnings: string[];
  fitSummary: string;
  evidence: string[];
  suggestedAction: string;
  eventDate: string | null;
  dateRange: { start: string; end: string } | null;
  isFutureEvent: boolean | null;
  isPastEvent: boolean | null;
  dateConfidence: DateConfidence;
  opportunityKind: OpportunityKind;
  ageMonths: number | null;
  derivedFromSimilarArtist?: DerivedFromSimilarArtist | null;
  target: BookingTarget;
  bookingScore: BookingScore;
  internalReview: OpportunityInternalReview;
}

export interface BookingRejectedByReason {
  pastEvent: number;
  missingDate: number;
  genreMismatch: number;
  duplicate: number;
  lowConfidence: number;
}

export interface BookingSearchResult {
  input: BookingSearchInput;
  targets: BookingTarget[];
  opportunities: BookingOpportunity[];
  sourcesUsed: string[];
  warnings: string[];
  sourceMetadata: BookingSourceMetadata[];
  rejectedByReason: BookingRejectedByReason;
}
