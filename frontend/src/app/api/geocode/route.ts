interface GeocodeRequest { queries?: unknown }

interface NominatimResult {
  lat: string;
  lon: string;
  boundingbox?: string[];
  address?: { country_code?: string };
}

const MAX_QUERIES = 50;
const cache = new Map<string, unknown>();

export async function POST(request: Request): Promise<Response> {
  let body: GeocodeRequest;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!Array.isArray(body.queries) || body.queries.length > MAX_QUERIES || body.queries.some((q) => typeof q !== "string" || !q.trim() || q.length > 300)) {
    return Response.json({ error: "queries must be an array of up to 50 location strings" }, { status: 400 });
  }

  const results: Record<string, unknown> = {};
  for (const rawQuery of body.queries as string[]) {
    const query = rawQuery.trim();
    const key = query.toLocaleLowerCase();
    if (cache.has(key)) { results[key] = cache.get(key); continue; }
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");
    try {
      const response = await fetch(url, { headers: { "User-Agent": "Artist-Radar/1.0 (geographic ecosystem map)" }, next: { revalidate: 2592000 } });
      const matches = response.ok ? await response.json() as NominatimResult[] : [];
      const match = matches[0];
      const value = match ? {
        latitude: Number(match.lat), longitude: Number(match.lon),
        countryCode: match.address?.country_code?.toUpperCase(),
        boundingBox: match.boundingbox?.map(Number),
      } : null;
      cache.set(key, value);
      results[key] = value;
    } catch { results[key] = null; }
  }
  return Response.json({ results });
}
