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
  spotifyMonthlyListeners?: number;
  spotifyFollowers?: number;
  chartmetricArtistScore?: number;
  primaryGenreSmart?: number;
}

export async function matchChartmetricArtist(
  input: ArtistEnrichmentInput,
  client: ChartmetricClient
): Promise<ChartmetricMatchOutcome> {
  const spotifyIdFromUrl = input.spotifyUrl ? extractSpotifyIdFromUrl(input.spotifyUrl) : null;

  if (input.spotifyArtistId) {
    const { data } = await client.getArtistBySpotifyId(input.spotifyArtistId);
    if (data) {
      return buildMatchedOutcome(data, "spotify_id", "exact");
    }
  }

  if (!input.spotifyArtistId && spotifyIdFromUrl) {
    const { data } = await client.getArtistBySpotifyId(spotifyIdFromUrl);
    if (data) {
      return buildMatchedOutcome(data, "spotify_url", "exact");
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

  const platformLinkMatches = exactNameMatches.filter((candidate) =>
    Boolean(candidate.spotifyId && (spotifyIdsMatch(candidate.spotifyId, input.spotifyArtistId) || spotifyIdsMatch(candidate.spotifyId, spotifyIdFromUrl)))
  );

  if (platformLinkMatches.length === 1) {
    return buildMatchedOutcome(platformLinkMatches[0]!, "name_with_platform_links", "high");
  }

  if (platformLinkMatches.length > 1) {
    return { status: "ambiguous" };
  }

  if (exactNameMatches.length > 1) {
    const spotifyId = input.spotifyArtistId ?? spotifyIdFromUrl;
    if (spotifyId) {
      const urlMatches = await findExactNameCandidateWithSpotifyUrlMatch(exactNameMatches, spotifyId, client);
      if (urlMatches.length === 1) {
        return buildMatchedOutcome(urlMatches[0]!, "name_with_platform_links", "high");
      }
      if (urlMatches.length > 1) {
        return { status: "ambiguous" };
      }
    }
    // Several artists share this exact name in Chartmetric's index — refuse
    // to guess unless a stronger platform identifier has already narrowed
    // the set to one candidate above.
    return { status: "ambiguous" };
  }

  const candidate = exactNameMatches[0]!;
  const hasGenreOrLocationEvidence = (input.genres?.length ?? 0) > 0 || Boolean(input.city) || Boolean(input.country);
  if (candidate.verified && hasGenreOrLocationEvidence) {
    return buildMatchedOutcome(candidate, "name_with_genre_location", "high");
  }

  return {
    status: "low_confidence",
    chartmetricArtistId: String(candidate.id),
    matchMethod: "name_with_genre_location",
    matchConfidence: hasGenreOrLocationEvidence ? "medium" : "low"
  };
}

function buildMatchedOutcome(
  candidate: {
    id: number;
    spotifyMonthlyListeners?: number;
    spotifyFollowers?: number;
    chartmetricArtistScore?: number;
    primaryGenreSmart?: number;
  },
  matchMethod: ArtistMatchMethod,
  matchConfidence: ArtistMatchConfidence
): ChartmetricMatchOutcome {
  return {
    status: "matched",
    chartmetricArtistId: String(candidate.id),
    matchMethod,
    matchConfidence,
    ...(candidate.spotifyMonthlyListeners !== undefined ? { spotifyMonthlyListeners: candidate.spotifyMonthlyListeners } : {}),
    ...(candidate.spotifyFollowers !== undefined ? { spotifyFollowers: candidate.spotifyFollowers } : {}),
    ...(candidate.chartmetricArtistScore !== undefined ? { chartmetricArtistScore: candidate.chartmetricArtistScore } : {}),
    ...(candidate.primaryGenreSmart !== undefined ? { primaryGenreSmart: candidate.primaryGenreSmart } : {})
  };
}

async function findExactNameCandidateWithSpotifyUrlMatch(
  candidates: Array<{
    id: number;
    spotifyMonthlyListeners?: number;
    spotifyFollowers?: number;
    chartmetricArtistScore?: number;
    primaryGenreSmart?: number;
  }>,
  spotifyArtistId: string,
  client: ChartmetricClient
): Promise<typeof candidates> {
  const matches: typeof candidates = [];
  for (const candidate of candidates) {
    const { data } = await client.getArtistUrls(String(candidate.id));
    if (
      data.spotifyIds.some((spotifyId) => spotifyIdsMatch(spotifyId, spotifyArtistId)) ||
      data.spotifyUrls.some((url) => spotifyIdsMatch(extractSpotifyIdFromUrl(url), spotifyArtistId))
    ) {
      matches.push(candidate);
    }
  }
  return matches;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractSpotifyIdFromUrl(url: string): string | null {
  const match = /open\.spotify\.com\/artist\/([a-zA-Z0-9]+)/.exec(url);
  return match ? match[1]! : null;
}

function spotifyIdsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}
