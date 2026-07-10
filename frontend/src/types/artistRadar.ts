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
}

// Normalized response returned by POST /api/artist-radar.
// Mirrors DashboardData so existing dashboard components can render it directly.
export interface ArtistRadarResponse extends DashboardData {
  warnings: string[];
}

// Job model for POST /api/artist-analysis and GET /api/artist-analysis/:jobId/status.
export type AnalysisStep =
  | "artist_profile"
  | "similar_artists"
  | "music_scene"
  | "venues_and_concerts"
  | "booking_scoring"
  | "dashboard_build";

export type StepStatus = "pending" | "running" | "completed" | "failed";

export interface AnalysisStepState {
  id: AnalysisStep;
  label: string;
  status: StepStatus;
}

export type AnalysisJobState = "queued" | "running" | "completed" | "failed";

export interface AnalysisJobStatus {
  jobId: string;
  status: AnalysisJobState;
  currentStep?: AnalysisStep;
  steps: AnalysisStepState[];
  error?: string;
}
