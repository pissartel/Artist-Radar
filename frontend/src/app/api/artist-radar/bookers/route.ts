import { mapBookerOpportunity } from "@/lib/server/artistRadarMapper";
import { runDeepBookerSearch } from "@/lib/server/backendPipeline";
import type { BackendArtistTier, BackendBookerSearchInput } from "@/lib/server/backendTypes";

const VALID_TIERS = new Set<BackendArtistTier>(["small", "medium", "large", "unknown"]);
const VALID_CATEGORIES = new Set(["local_peer", "regional_peer", "support_target", "reference", "to_verify", "unknown"]);

function cleanString(value: unknown, maxLength = 200): string | null {
  return typeof value === "string" && value.trim() && value.length <= maxLength ? value.trim() : null;
}

function parseRequest(body: Record<string, unknown>): BackendBookerSearchInput | null {
  const artist = cleanString(body.artist);
  const city = cleanString(body.city);
  const genre = cleanString(body.genre);
  if (!artist || !city || !genre || !Array.isArray(body.similarArtists)) return null;
  const similarArtists = body.similarArtists.slice(0, 30).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const raw = value as Record<string, unknown>;
    const name = cleanString(raw.name);
    if (!name) return [];
    const artistTier = typeof raw.artistTier === "string" && VALID_TIERS.has(raw.artistTier as BackendArtistTier)
      ? raw.artistTier as BackendArtistTier : "unknown";
    return [{
      name,
      genres: Array.isArray(raw.genres) ? raw.genres.flatMap((item) => cleanString(item, 100) ?? []).slice(0, 20) : [],
      city: cleanString(raw.city),
      country: cleanString(raw.country),
      artistTier,
      bookingCategory: typeof raw.bookingCategory === "string" && VALID_CATEGORIES.has(raw.bookingCategory) ? raw.bookingCategory : "unknown",
    }];
  });
  if (similarArtists.length === 0) return null;
  const country = cleanString(body.country);
  return {
    artist, city, genre, target: country, limit: 24, mode: "deep",
    artistProfile: { artistName: artist, city, country, genres: [genre], estimatedLevel: "emerging" },
    similarArtists,
  } as BackendBookerSearchInput;
}

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const input = parseRequest(body);
  if (!input) return Response.json({ error: "Artist, city, genre, and at least one similar artist are required." }, { status: 400 });
  try {
    const result = await runDeepBookerSearch(input);
    return Response.json({ opportunities: result.opportunities.map(mapBookerOpportunity), warnings: result.warnings });
  } catch {
    return Response.json({ error: "The deeper booker search could not be completed." }, { status: 500 });
  }
}
