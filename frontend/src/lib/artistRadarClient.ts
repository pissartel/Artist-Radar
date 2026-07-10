import type { AnalysisJobStatus, ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";

export class ArtistRadarClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtistRadarClientError";
  }
}

const DEFAULT_ERROR_MESSAGE = "Failed to load Artist Radar data. Please try again.";

async function extractErrorMessage(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
    ? payload.error
    : DEFAULT_ERROR_MESSAGE;
}

export async function fetchArtistRadarData(
  request: ArtistRadarRequest
): Promise<ArtistRadarResponse> {
  let response: Response;
  try {
    response = await fetch("/api/artist-radar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new ArtistRadarClientError("Could not reach the Artist Radar API. Check your connection and try again.");
  }

  if (!response.ok) {
    throw new ArtistRadarClientError(await extractErrorMessage(response));
  }

  return (await response.json()) as ArtistRadarResponse;
}

export async function createAnalysisJob(request: ArtistRadarRequest): Promise<{ jobId: string }> {
  let response: Response;
  try {
    response = await fetch("/api/artist-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new ArtistRadarClientError("Could not reach the Artist Radar API. Check your connection and try again.");
  }

  if (!response.ok) {
    throw new ArtistRadarClientError(await extractErrorMessage(response));
  }

  return (await response.json()) as { jobId: string };
}

export async function fetchAnalysisJobStatus(jobId: string): Promise<AnalysisJobStatus> {
  let response: Response;
  try {
    response = await fetch(`/api/artist-analysis/${encodeURIComponent(jobId)}/status`);
  } catch {
    throw new ArtistRadarClientError("Could not reach the Artist Radar API. Check your connection and try again.");
  }

  if (!response.ok) {
    throw new ArtistRadarClientError(await extractErrorMessage(response));
  }

  return (await response.json()) as AnalysisJobStatus;
}

export async function fetchAnalysisJobResult(jobId: string): Promise<ArtistRadarResponse> {
  let response: Response;
  try {
    response = await fetch(`/api/artist-analysis/${encodeURIComponent(jobId)}/result`);
  } catch {
    throw new ArtistRadarClientError("Could not reach the Artist Radar API. Check your connection and try again.");
  }

  if (!response.ok) {
    throw new ArtistRadarClientError(await extractErrorMessage(response));
  }

  return (await response.json()) as ArtistRadarResponse;
}
