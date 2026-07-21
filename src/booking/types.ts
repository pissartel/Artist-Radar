import type { ArtistProfile, ArtistTier, SimilarArtist } from "../schemas.js";
import type { OpportunityEnrichment } from "../enrichment/types.js";
import type { OpportunityMatchBreakdown } from "./matchFactors.js";
import type { SupportSlotPotentialResult } from "./supportSlotPotential.js";

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
  /** Venue name, when a source reports it. Never guessed. */
  venueName?: string | null;
  /** Full announced lineup (headliner + support), when a source lists it. Never guessed. */
  lineup?: string[];
  /** Poster/event image URL, extracted from source page metadata. Never guessed. */
  imageUrl?: string | null;
  /** Ticket/booking purchase URL, when a source reports it (e.g. schema.org Offer). Never guessed. */
  ticketUrl?: string | null;
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
  venueName?: string | null;
  lineup?: string[];
  imageUrl?: string | null;
  ticketUrl?: string | null;
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
  genreLevel: string;
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
  imageUrl: string | null;
  ticketUrl: string | null;
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
  matchBreakdown: OpportunityMatchBreakdown;
  internalReview: OpportunityInternalReview;
  // Structured support-slot-potential analysis (issue #158), null for
  // opportunity types this analysis doesn't apply to (e.g. festivals).
  supportSlotPotential: SupportSlotPotentialResult | null;
  // Organizer/promoter/ticketing contact enrichment (issue #159), populated
  // after this opportunity is built. Null until enrichment runs (or when it
  // is disabled/fails) — enrichment failure never removes the base opportunity.
  contactEnrichment: OpportunityEnrichment | null;
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
