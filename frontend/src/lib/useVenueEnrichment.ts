"use client";

import { useQuery } from "@tanstack/react-query";
import type { VenueInfo } from "@/lib/venue";
import type { CachedVenueEnrichment, VenueEnrichmentRequest } from "@/types/venueEnrichment";

interface VenueEnrichmentApiResponse {
  success: boolean;
  data?: CachedVenueEnrichment;
  error?: { code: string; message: string };
}

export function useVenueEnrichment(venue: VenueInfo | null) {
  return useQuery({
    queryKey: ["venueEnrichment", venue?.id ?? null],
    enabled: Boolean(venue),
    queryFn: async () => {
      if (!venue) throw new Error("Venue is required.");
      const response = await fetch(`/api/venues/${encodeURIComponent(venue.id)}/enrichment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toVenueEnrichmentRequest(venue)),
      });
      const payload = (await response.json()) as VenueEnrichmentApiResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? "Venue enrichment failed.");
      }
      return payload.data;
    },
    staleTime: 30 * 24 * 60 * 60 * 1000,
    gcTime: 30 * 24 * 60 * 60 * 1000,
    // OpenAI web-search enrichment is relatively slow. Do not silently run
    // the whole request several times; expose the first failure and let the
    // user retry deliberately.
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

const NON_HOMEPAGE_PATH_PATTERN = /\/(artists?|events?|calendar|tickets?|billetterie|billets|e|tour|agenda|programme|programmation|concerts?)(\/|$)/i;

function safeVenueWebsite(value?: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const rejectedHost = [
      "concertarchives.org",
      "bandsintown.com",
      "songkick.com",
      "ticketmaster.",
      "shotgun.live",
      "infoconcert.",
    ].some((domain) => host === domain || host.endsWith(`.${domain}`) || host.includes(domain));
    return rejectedHost || NON_HOMEPAGE_PATH_PATTERN.test(parsed.pathname) ? null : value;
  } catch {
    return null;
  }
}

export function toVenueEnrichmentRequest(venue: VenueInfo): VenueEnrichmentRequest {
  return {
    id: venue.id,
    name: venue.name,
    website: safeVenueWebsite(venue.website),
    address: venue.address ?? null,
    postalCode: venue.postalCode ?? null,
    region: venue.region ?? null,
    city: venue.city ?? null,
    country: venue.country ?? null,
    capacity: venue.capacity ?? null,
    contact: venue.contact ?? null,
    venueType: venue.venueType ?? null,
    venueTypeLabel: venue.venueTypeLabel ?? null,
    sourceUrl: venue.sourceUrl ?? null,
    sourceUrls: venue.sourceUrls ?? [],
  };
}
