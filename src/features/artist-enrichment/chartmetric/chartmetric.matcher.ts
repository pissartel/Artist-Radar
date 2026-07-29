// Issue #142 section 1: resolve the correct Chartmetric artist using the
// strongest identifiers available, in priority order:
//   1. Spotify artist ID
//   2. Spotify artist URL
//   3. another exact platform ID (not yet wired to a Chartmetric lookup
//      endpoint in this phase — see note below)
//   4. normalized artist name + known platform links
//   5. normalized artist name + genre/location evidence
//
// "Never match from name alone when several plausible candidates exist" is
// enforced by returning `ambiguous` rather than picking the first result.
import type { ChartmetricClient } from "./chartmetric.client.js";
import type { ArtistEnrichmentInput, ArtistMatchConfidence, ArtistMatchMethod } from "./chartmetric.types.js";

export type ChartmetricMatchStatus = "matched" | "low_confidence" | "ambiguous" | "not_found";

export interface ChartmetricMatchOutcome {
  status: ChartmetricMatchStatus;
  chartmetricArtistId?: string;
  matchMethod?: ArtistMatchMethod;
  matchConfidence?: ArtistMatchConfidence;
}

export async function matchChartmetricArtist(
  input: ArtistEnrichmentInput,
  client: ChartmetricClient
): Promise<ChartmetricMatchOutcome> {
  const spotifyIdFromUrl = input.spotifyUrl ? extractSpotifyIdFromUrl(input.spotifyUrl) : null;

  if (input.spotifyArtistId) {
    const { data } = await client.getArtistBySpotifyId(input.spotifyArtistId);
    if (data) {
      return { status: "matched", chartmetricArtistId: String(data.id), matchMethod: "spotify_id", matchConfidence: "exact" };
    }
  }

  if (!input.spotifyArtistId && spotifyIdFromUrl) {
    const { data } = await client.getArtistBySpotifyId(spotifyIdFromUrl);
    if (data) {
      return { status: "matched", chartmetricArtistId: String(data.id), matchMethod: "spotify_url", matchConfidence: "exact" };
    }
  }

  // Priority #3 (another exact platform ID, e.g. MusicBrainz) has no
  // corresponding Chartmetric lookup endpoint wired up in this phase-1
  // client; `input.externalIds` is accepted for forward compatibility but
  // intentionally not consulted here yet.

  const trimmedName = input.artistName?.trim();
  if (!trimmedName) {
    return { status: "not_found" };
  }

  const { data: candidates } = await client.searchArtistsByName(trimmedName);
  const normalizedTarget = normalizeName(trimmedName);
  const exactNameMatches = candidates.filter((candidate) => normalizeName(candidate.name) === normalizedTarget);

  if (exactNameMatches.length === 0) {
    return { status: "not_found" };
  }

  if (exactNameMatches.length > 1) {
    // Several artists share this exact name in Chartmetric's index — refuse
    // to guess, even if some corroborating evidence exists for one of them,
    // since a wrong automatic pick is worse than skipping enrichment.
    return { status: "ambiguous" };
  }

  const candidate = exactNameMatches[0]!;
  const platformLinkMatches = Boolean(
    candidate.spotifyId && (candidate.spotifyId === input.spotifyArtistId || candidate.spotifyId === spotifyIdFromUrl)
  );

  if (platformLinkMatches) {
    return {
      status: "matched",
      chartmetricArtistId: String(candidate.id),
      matchMethod: "name_with_platform_links",
      matchConfidence: "high"
    };
  }

  const hasGenreOrLocationEvidence = (input.genres?.length ?? 0) > 0 || Boolean(input.city) || Boolean(input.country);
  return {
    status: "low_confidence",
    chartmetricArtistId: String(candidate.id),
    matchMethod: "name_with_genre_location",
    matchConfidence: hasGenreOrLocationEvidence ? "medium" : "low"
  };
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractSpotifyIdFromUrl(url: string): string | null {
  const match = /open\.spotify\.com\/artist\/([a-zA-Z0-9]+)/.exec(url);
  return match ? match[1]! : null;
}
