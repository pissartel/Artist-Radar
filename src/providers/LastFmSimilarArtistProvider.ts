import type {
  SimilarArtistProvider,
  SimilarArtistDiscoveryCandidate,
  SimilarArtistsFinderInput
} from "../modules/similarArtistsFinder.js";
import { getLastFmSimilarArtists } from "../services/lastfmService.js";

export function buildLastFmSimilarArtistProvider(env: SimilarArtistsFinderInput["env"]): SimilarArtistProvider {
  return {
    name: "lastfm_similar",
    async discover(input) {
      const artistName = input.profile.artistName ?? input.profile.spotifyArtistName ?? null;
      if (!artistName) {
        return [];
      }

      const limit = parseLastFmLimit(env?.LASTFM_SIMILAR_LIMIT, env?.LASTFM_API_KEY);
      const similarArtists = await (input.lastfmSimilarArtists ?? ((name: string, limit: number) => getLastFmSimilarArtists(name, limit, env)))(
        artistName,
        limit
      );
      return similarArtists.map((artist) => mapLastFmSimilarArtist(artist.name, artist.url, artist.match, artistName));
    }
  };
}

function parseLastFmLimit(value: string | undefined, apiKey: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isFinite(parsed)) {
    return Math.max(1, Math.min(parsed, 100));
  }
  return apiKey ? 50 : 15;
}

function mapLastFmSimilarArtist(
  name: string,
  url: string | null,
  match: number | null,
  artistName: string
): SimilarArtistDiscoveryCandidate {
  const sourceConfidence = match !== null ? Math.max(0.45, Math.min(0.98, match)) : 0.72;
  return {
    name,
    genres: [],
    city: null,
    country: null,
    url,
    source: "lastfm_similar",
    reason: `Last.fm similar artists candidate for ${artistName}.`,
    matchedQuery: artistName,
    sourceConfidence,
    estimatedTier: null
  };
}
