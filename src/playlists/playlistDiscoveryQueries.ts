import { getRelatedGenres } from "../booking/genreMatching.js";

export function buildGenrePlaylistQueries(genre: string): string[] {
  const genres = getRelatedGenres([genre]);
  return [...new Set([
    `\"${genres[0] ?? genre}\" playlist Spotify`,
    `\"${genres[0] ?? genre}\" independent playlist curator`,
    `\"${genres[1] ?? genre}\" playlist submissions`
  ])];
}

export function buildSimilarArtistPlaylistQueries(artistName: string): string[] {
  return [
    `\"${artistName}\" playlist Spotify`,
    `\"${artistName}\" playlist curator submission`
  ];
}

export function buildRegionalPlaylistQueries(genre: string, location: string): string[] {
  return [`\"${genre}\" playlist ${location}`, `independent playlist curator ${genre} ${location}`];
}

export function buildSubmissionPlatformQueries(genre: string): string[] {
  return [
    `site:submithub.com playlist ${genre}`,
    `site:groover.co playlist curator ${genre}`,
    `official playlist submission ${genre}`
  ];
}
