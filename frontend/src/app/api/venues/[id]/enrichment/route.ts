import { getOrEnrichVenue } from "@/lib/server/venueEnrichment";
import type { VenueEnrichmentRequest } from "@/types/venueEnrichment";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ErrorCode = "INVALID_JSON" | "INVALID_REQUEST" | "VENUE_ENRICHMENT_FAILED";

function errorResponse(status: number, code: ErrorCode, message: string): Response {
  return Response.json({ success: false, error: { code, message } }, { status });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const venue = parseVenueEnrichmentRequest(id, body);
  if (!venue) {
    return errorResponse(400, "INVALID_REQUEST", "Venue id and name are required.");
  }

  try {
    const result = await getOrEnrichVenue(venue);
    return Response.json({ success: true, data: result }, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Venue enrichment failed for ${venue.id}:`, error);
    return errorResponse(
      500,
      "VENUE_ENRICHMENT_FAILED",
      `Venue enrichment could not be completed: ${detail}`,
    );
  }
}

function parseVenueEnrichmentRequest(id: string, body: unknown): VenueEnrichmentRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const data = body as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!id.trim() || !name) return null;

  return {
    id: id.trim(),
    name,
    website: optionalString(data.website),
    address: optionalString(data.address),
    postalCode: optionalString(data.postalCode),
    region: optionalString(data.region),
    city: optionalString(data.city),
    country: optionalString(data.country),
    capacity: typeof data.capacity === "number" && Number.isInteger(data.capacity) && data.capacity > 0 ? data.capacity : null,
    contact: optionalString(data.contact),
    venueType: optionalString(data.venueType),
    venueTypeLabel: optionalString(data.venueTypeLabel),
    sourceUrl: optionalString(data.sourceUrl),
    sourceUrls: Array.isArray(data.sourceUrls) ? data.sourceUrls.flatMap((value) => optionalString(value) ?? []) : [],
  };
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
