import type { DashboardData } from "./index";

// Request body accepted by POST /api/artist-radar.
export interface ArtistRadarRequest {
  artistName: string;
  genre: string;
  location: string;
  // Defaults to true: booking is the current product focus.
  // When false, booking-related fields in the response are left empty.
  enableBooking?: boolean;
  // Optional Spotify artist URL used to enrich the main artist with Spotify metadata.
  spotifyUrl?: string;
  // Optional client-generated id used to poll GET /api/artist-radar/status/[executionId]
  // for real-time pipeline stage progress while this request is in flight.
  executionId?: string;
  // Client-only, non-production preview path. Never sent to the API.
  previewData?: boolean;
  referenceCountry?: string;
  // Explicit, per-request feature toggles (issue #142). Currently only the
  // Chartmetric audience-enrichment preview toggle, only ever shown/settable
  // in preview and development (see lib/server/chartmetricToggle.ts) — the
  // backend server-side flag/kill switch always applies on top and is the
  // only thing that matters in production; the backend ignores this field
  // entirely there regardless of what a client sends.
  features?: {
    chartmetricArtistEnrichment?: boolean;
  };
}

// Normalized response returned by POST /api/artist-radar.
// Mirrors DashboardData so existing dashboard components can render it directly.
export interface ArtistRadarResponse extends DashboardData {
  warnings: string[];
}
