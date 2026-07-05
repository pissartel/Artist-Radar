import type { ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";

export class ArtistRadarClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtistRadarClientError";
  }
}

const DEFAULT_ERROR_MESSAGE = "Failed to load Artist Radar data. Please try again.";

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

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : DEFAULT_ERROR_MESSAGE;
    throw new ArtistRadarClientError(message);
  }

  return payload as ArtistRadarResponse;
}
