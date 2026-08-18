import type { ArtistProfile, Opportunity, SimilarArtist } from "@/types";

export interface DeepBookerSearchResponse {
  opportunities: Opportunity[];
  warnings: string[];
}

function locationCountry(location: string): string | null {
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] ?? null : null;
}

export async function fetchDeepBookerSearch(
  artist: ArtistProfile,
  similarArtists: SimilarArtist[],
): Promise<DeepBookerSearchResponse> {
  const response = await fetch("/api/artist-radar/bookers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      artist: artist.name,
      city: artist.city,
      country: artist.country,
      genre: artist.genres[0],
      similarArtists: similarArtists.map((candidate) => ({
        name: candidate.name,
        genres: candidate.genres,
        city: candidate.location.split(",")[0]?.trim() || null,
        country: locationCountry(candidate.location),
        artistTier: candidate.artistTier === "emerging" ? "small" : candidate.artistTier === "rising" ? "medium" : candidate.artistTier ? "large" : "unknown",
        bookingCategory: candidate.bookingCategory ?? "unknown",
      })),
    }),
  });
  const payload = await response.json().catch(() => null) as (DeepBookerSearchResponse & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error ?? "The deeper booker search could not be completed.");
  return payload;
}
