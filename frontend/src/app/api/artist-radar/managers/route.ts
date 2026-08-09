import { mapManagerOpportunity } from "@/lib/server/artistRadarMapper";
import { runDeepManagerSearch } from "@/lib/server/backendPipeline";
import type { BackendArtistTier, BackendManagerSearchInput } from "@/lib/server/backendTypes";

interface RawDeepSearchRequest {
  artist?: unknown;
  city?: unknown;
  country?: unknown;
  genre?: unknown;
  artistTier?: unknown;
  similarArtists?: unknown;
}

const VALID_TIERS = new Set<BackendArtistTier>(["small", "medium", "large", "unknown"]);

function cleanString(value: unknown, maxLength = 200): string | null {
  return typeof value === "string" && value.trim() && value.length <= maxLength ? value.trim() : null;
}

function parseTier(value: unknown): BackendArtistTier {
  return typeof value === "string" && VALID_TIERS.has(value as BackendArtistTier)
    ? value as BackendArtistTier
    : "unknown";
}

function parseRequest(body: RawDeepSearchRequest): BackendManagerSearchInput | null {
  const artist = cleanString(body.artist);
  const city = cleanString(body.city);
  const genre = cleanString(body.genre);
  if (!artist || !city || !genre || !Array.isArray(body.similarArtists)) return null;

  const similarArtists = body.similarArtists.slice(0, 30).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const raw = value as Record<string, unknown>;
    const name = cleanString(raw.name);
    if (!name) return [];
    const genres = Array.isArray(raw.genres)
      ? raw.genres.slice(0, 20).flatMap((item) => cleanString(item, 100) ?? [])
      : [];
    return [{
      name,
      genres,
      city: cleanString(raw.city),
      country: cleanString(raw.country),
      artistTier: parseTier(raw.artistTier),
    }];
  });
  if (similarArtists.length === 0) return null;

  const country = cleanString(body.country);
  return {
    artist,
    city,
    genre,
    target: country,
    limit: 24,
    mode: "deep",
    artistProfile: {
      artistName: artist,
      city,
      country,
      genres: [genre],
      estimatedLevel: body.artistTier === "small" ? "emerging" : body.artistTier === "medium" ? "developing" : body.artistTier === "large" ? "established" : "unknown",
    },
    similarArtists,
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: RawDeepSearchRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const input = parseRequest(body);
  if (!input) {
    return Response.json({ error: "Artist, city, genre, and at least one similar artist are required." }, { status: 400 });
  }

  try {
    const result = await runDeepManagerSearch(input);
    return Response.json({
      managers: result.opportunities.flatMap((opportunity) => {
        const mapped = mapManagerOpportunity(opportunity);
        return mapped ? [mapped] : [];
      }),
      warnings: result.warnings,
      fromCache: result.fromCache,
    });
  } catch {
    return Response.json({ error: "The deeper manager search could not be completed." }, { status: 500 });
  }
}
