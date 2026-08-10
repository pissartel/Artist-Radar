export interface VenueEnrichmentSource {
  url: string;
  title?: string | null;
  type?: string | null;
  fields?: string[];
}

export type VenueOfficialUrlType = "venue" | "operator" | "municipality" | "social" | "other";

export interface VenueProgrammedArtist {
  name: string;
  eventUrl?: string | null;
  date?: string | null;
}

export interface VenueEnrichment {
  officialName?: string | null;
  officialUrl?: string | null;
  officialUrlType?: VenueOfficialUrlType | null;
  officialOrganizationName?: string | null;
  officialUrlConfidence?: number | null;
  enrichmentSource?: string | null;
  description?: string | null;
  type?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  capacity?: number | null;
  website?: string | null;
  programmingUrl?: string | null;
  contactUrl?: string | null;
  contactEmail?: string | null;
  bookingEmail?: string | null;
  bookingContactName?: string | null;
  phone?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  otherSocialLinks?: string[];
  genres?: string[];
  programsLiveMusic?: boolean | null;
  booksEmergingArtists?: boolean | null;
  programmedArtists?: VenueProgrammedArtist[];
  sources: VenueEnrichmentSource[];
}

export interface CachedVenueEnrichment {
  venueId: string;
  enrichedAt: string;
  enrichmentVersion: number;
  enrichment: VenueEnrichment;
  cacheHit: boolean;
}

export interface VenueEnrichmentRequest {
  id: string;
  name: string;
  website?: string | null;
  address?: string | null;
  postalCode?: string | null;
  region?: string | null;
  city?: string | null;
  country?: string | null;
  capacity?: number | null;
  contact?: string | null;
  venueType?: string | null;
  venueTypeLabel?: string | null;
  sourceUrl?: string | null;
  sourceUrls?: string[];
}
