import type { DashboardData } from "./index";

// Request body accepted by POST /api/artist-radar.
export interface ArtistRadarRequest {
  artistName: string;
  genre: string;
  location: string;
  // Defaults to true: booking is the current product focus.
  // When false, booking-related fields in the response are left empty.
  enableBooking?: boolean;
}

// Normalized response returned by POST /api/artist-radar.
// Mirrors DashboardData so existing dashboard components can render it directly.
export interface ArtistRadarResponse extends DashboardData {
  warnings: string[];
}
