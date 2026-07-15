import type { ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";

export class ArtistRadarClientError extends Error {
  /** Non-sensitive error code from the API (see route.ts), for debugging/telemetry. */
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ArtistRadarClientError";
    this.code = code;
  }
}

const DEFAULT_ERROR_MESSAGE = "Failed to load Artist Radar data. Please try again.";

interface StructuredErrorPayload {
  success: false;
  error: { code: string; message: string };
}

function isStructuredErrorPayload(payload: unknown): payload is StructuredErrorPayload {
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    (payload as { success?: unknown }).success === false &&
    typeof (payload as { error?: unknown }).error === "object" &&
    (payload as { error?: unknown }).error !== null &&
    typeof (payload as { error: { message?: unknown } }).error.message === "string"
  );
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

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isStructuredErrorPayload(payload)) {
      throw new ArtistRadarClientError(payload.error.message, payload.error.code);
    }
    throw new ArtistRadarClientError(DEFAULT_ERROR_MESSAGE);
  }

  return payload as ArtistRadarResponse;
}
