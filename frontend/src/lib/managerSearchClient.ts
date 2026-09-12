import type { ArtistProfile, Opportunity, SimilarArtist } from "@/types";

export interface DeepManagerSearchResponse {
  opportunities: Opportunity[];
  warnings: string[];
  fromCache: boolean;
}

export async function fetchDeepManagerSearch(
  artist: ArtistProfile,
  similarArtists: SimilarArtist[],
): Promise<DeepManagerSearchResponse> {
  const response = await fetch("/api/artist-radar/managers", {
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
        country: null,
        artistTier: candidate.artistTier === "emerging" ? "small" : candidate.artistTier === "rising" ? "medium" : candidate.artistTier ? "large" : "unknown",
      })),
    }),
  });
  const payload = await response.json().catch(() => null) as (DeepManagerSearchResponse & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error ?? "The deeper manager search could not be completed.");
  return payload;
}
