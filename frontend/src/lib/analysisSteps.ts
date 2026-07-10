import type { AnalysisStepState } from "@/types/artistRadar";

// Client-safe mirror of the step labels defined in
// lib/server/analysisJobStore.ts, used only to render the checklist as
// "pending" before the first job status response arrives.
export const DEFAULT_ANALYSIS_STEPS: AnalysisStepState[] = [
  { id: "artist_profile", label: "Analyzing artist profile", status: "pending" },
  { id: "similar_artists", label: "Finding similar artists", status: "pending" },
  { id: "music_scene", label: "Mapping music scene", status: "pending" },
  { id: "venues_and_concerts", label: "Scanning venues and concerts", status: "pending" },
  { id: "booking_scoring", label: "Scoring booking opportunities", status: "pending" },
  { id: "dashboard_build", label: "Building dashboard", status: "pending" },
];
