import type { ArtistProfile } from "../schemas.js";
import { extractInstagramHandles } from "../modules/instagramHandleExtractor.js";
import { searchSpotifyArtists, type SpotifyArtistProfile } from "./spotifyService.js";
import { debugLog } from "../utils/logger.js";

export type ArtistVerificationStatus = "verified" | "needs_verification" | "unverified";

export interface WebSearchResult {
  title: string | null;
  url: string | null;
  snippet: string | null;
  markdown?: string | null;
  links?: string[];
}

export interface WebSearchProvider {
  search(query: string, limit: number): Promise<WebSearchResult[]>;
}

export interface ArtistVerificationCandidate {
  name: string;
  genres: string[];
  sources: string[];
  spotifyId?: string | null;
  spotifyUrl?: string | null;
  instagramUrl?: string | null;
  instagramHandle?: string | null;
  youtubeUrl?: string | null;
  country?: string | null;
  city?: string | null;
  musicBrainzId?: string | null;
  sourceUrls?: string[];
}

export interface ArtistVerificationContext {
  profile: ArtistProfile;
  target?: string | null;
  city?: string | null;
  genre?: string | null;
  spotifySearch?: (query: string, limit: number) => Promise<SpotifyArtistProfile[]>;
  webSearchProvider?: WebSearchProvider | null;
  env?: {
    SPOTIFY_CLIENT_ID?: string;
    SPOTIFY_CLIENT_SECRET?: string;
    DEBUG_ARTIST_VERIFICATION?: string;
  };
}

export interface ArtistVerificationResult {
  spotifyUrl: string | null;
  spotifyId: string | null;
  instagramUrl: string | null;
  instagramHandle: string | null;
  youtubeUrl: string | null;
  country: string | null;
  city: string | null;
  genres: string[];
  verificationStatus: ArtistVerificationStatus;
  evidenceNotes: string[];
  sourceUrls: string[];
}

export async function verifyAndEnrichArtistCandidate(
  candidate: ArtistVerificationCandidate,
  context: ArtistVerificationContext
): Promise<ArtistVerificationResult> {
  const evidenceNotes: string[] = [];
  const sourceUrls = uniqueStrings(candidate.sourceUrls ?? []);
  let spotifyId = candidate.spotifyId ?? null;
  let spotifyUrl = candidate.spotifyUrl ?? null;
  let instagramUrl = candidate.instagramUrl ?? null;
  let instagramHandle = candidate.instagramHandle ?? null;
  let youtubeUrl = candidate.youtubeUrl ?? null;
  let country = candidate.country ?? null;
  let city = candidate.city ?? null;
  let genres = uniqueStrings(candidate.genres);

  debugLog("artist-verification", "verification started", {
    candidateName: candidate.name,
    sources: candidate.sources
  });

  if (!spotifyId) {
    const spotifySearch = context.spotifySearch ?? ((query: string, limit: number) => searchSpotifyArtists(query, limit, context.env));
    const spotifyMatches = await spotifySearch(candidate.name, 5);
    const bestSpotifyMatch = pickBestSpotifyMatch(candidate, spotifyMatches);
    if (bestSpotifyMatch) {
      spotifyId = bestSpotifyMatch.id;
      spotifyUrl = bestSpotifyMatch.spotifyUrl;
      genres = uniqueStrings([...genres, ...bestSpotifyMatch.genres]);
      sourceUrls.push(...compactStrings([bestSpotifyMatch.spotifyUrl]));
      evidenceNotes.push(`Spotify matched ${bestSpotifyMatch.name}.`);
    }
    debugLog("artist-verification", "Spotify verification result", {
      candidateName: candidate.name,
      attempted: true,
      matched: Boolean(bestSpotifyMatch),
      spotifyId: bestSpotifyMatch?.id ?? null
    });
  } else {
    sourceUrls.push(...compactStrings([spotifyUrl]));
    evidenceNotes.push("Candidate already had a Spotify identity.");
  }

  const webSearchProvider = context.webSearchProvider ?? null;
  const instagramQueries = buildInstagramSearchQueries(candidate.name, {
    genre: context.genre ?? genres[0] ?? null,
    country,
    target: context.target ?? null
  });
  const youtubeQueries = buildYouTubeSearchQueries(candidate.name);

  debugLog("artist-verification", "web search queries generated", {
    candidateName: candidate.name,
    instagramQueries,
    youtubeQueries
  });

  if (webSearchProvider) {
    if (!instagramUrl) {
      const instagramMatch = await findInstagramFromSearchResults(webSearchProvider, instagramQueries);
      if (instagramMatch) {
        instagramUrl = instagramMatch.url;
        instagramHandle = instagramMatch.handle;
        sourceUrls.push(instagramMatch.sourceUrl);
        evidenceNotes.push(`Instagram handle found from public search result: ${instagramMatch.handle}.`);
      }
      debugLog("artist-verification", "Instagram discovery result", {
        candidateName: candidate.name,
        found: Boolean(instagramMatch),
        instagramHandle: instagramMatch?.handle ?? null
      });
    }

    if (!youtubeUrl) {
      const youtubeMatch = await findYouTubeFromSearchResults(webSearchProvider, youtubeQueries);
      if (youtubeMatch) {
        youtubeUrl = youtubeMatch.url;
        sourceUrls.push(youtubeMatch.url);
        evidenceNotes.push("YouTube URL found from public search result.");
      }
      debugLog("artist-verification", "YouTube discovery result", {
        candidateName: candidate.name,
        found: Boolean(youtubeMatch),
        youtubeUrl: youtubeMatch?.url ?? null
      });
    }
  } else {
    debugLog("artist-verification", "web search skipped", {
      candidateName: candidate.name,
      reason: "no web search provider configured"
    });
  }

  if (candidate.musicBrainzId) {
    evidenceNotes.push(`MusicBrainz identity present: ${candidate.musicBrainzId}.`);
  }

  const verificationStatus = determineVerificationStatus({
    spotifyUrl,
    instagramUrl,
    youtubeUrl,
    musicBrainzId: candidate.musicBrainzId ?? null,
    sources: candidate.sources
  });

  if (verificationStatus === "needs_verification" && evidenceNotes.length === 0) {
    evidenceNotes.push("Candidate is musically promising but still needs identity verification.");
  }
  if (verificationStatus === "unverified") {
    evidenceNotes.push("No usable identity evidence found.");
  }

  const result = {
    spotifyUrl,
    spotifyId,
    instagramUrl,
    instagramHandle,
    youtubeUrl,
    country,
    city,
    genres,
    verificationStatus,
    evidenceNotes: uniqueStrings(evidenceNotes),
    sourceUrls: uniqueStrings(sourceUrls)
  };

  debugLog("artist-verification", "verification completed", {
    candidateName: candidate.name,
    verificationStatus,
    evidenceNotes: result.evidenceNotes
  });

  return result;
}

function pickBestSpotifyMatch(
  candidate: ArtistVerificationCandidate,
  matches: SpotifyArtistProfile[]
): SpotifyArtistProfile | null {
  const exact = matches.find((match) => normalizeComparableName(match.name) === normalizeComparableName(candidate.name));
  if (exact) {
    return exact;
  }

  const candidateGenres = new Set(candidate.genres.map(normalizeComparableName));
  return matches.find((match) => {
    const nameClose = isCloseNameMatch(candidate.name, match.name);
    const genreOverlap = match.genres.some((genre) => candidateGenres.has(normalizeComparableName(genre)));
    return nameClose && genreOverlap;
  }) ?? null;
}

function buildInstagramSearchQueries(
  artistName: string,
  context: { genre?: string | null; country?: string | null; target?: string | null }
): string[] {
  return uniqueStrings([
    `"${artistName}" Instagram`,
    `"${artistName}" band Instagram`,
    context.genre ? `"${artistName}" "${context.genre}" Instagram` : "",
    context.country ? `"${artistName}" "${context.country}" Instagram` : context.target ? `"${artistName}" "${context.target}" Instagram` : "",
    `site:instagram.com "${artistName}"`
  ]);
}

function buildYouTubeSearchQueries(artistName: string): string[] {
  return uniqueStrings([
    `"${artistName}" YouTube`,
    `"${artistName}" band YouTube`,
    `site:youtube.com "${artistName}"`
  ]);
}

async function findInstagramFromSearchResults(
  provider: WebSearchProvider,
  queries: string[]
): Promise<{ handle: string; url: string; sourceUrl: string } | null> {
  for (const query of queries) {
    const results = await provider.search(query, 5);
    for (const result of results) {
      const sourceText = compactStrings([result.url, result.title, result.snippet]).join(" ");
      const handles = extractInstagramHandles({
        content: sourceText,
        sourceUrl: result.url
      });
      const match = handles.find((handle) => handle.confidence >= 0.75);
      if (match && match.sourceUrl) {
        return {
          handle: match.handle,
          url: match.url,
          sourceUrl: match.sourceUrl
        };
      }
    }
  }
  return null;
}

async function findYouTubeFromSearchResults(
  provider: WebSearchProvider,
  queries: string[]
): Promise<{ url: string } | null> {
  for (const query of queries) {
    const results = await provider.search(query, 5);
    for (const result of results) {
      const url = normalizeYouTubeCandidateUrl(result.url);
      if (url) {
        return { url };
      }
    }
  }
  return null;
}

function normalizeYouTubeCandidateUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "");
    const firstSegment = url.pathname.split("/").filter(Boolean)[0] ?? "";
    const allowedPath = firstSegment.startsWith("@") || ["channel", "c", "user"].includes(firstSegment);
    if ((hostname === "youtube.com" || hostname === "m.youtube.com") && allowedPath) {
      url.search = "";
      url.hash = "";
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function determineVerificationStatus(input: {
  spotifyUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  musicBrainzId: string | null;
  sources: string[];
}): ArtistVerificationStatus {
  if (input.spotifyUrl || input.instagramUrl || input.youtubeUrl || input.musicBrainzId) {
    return "verified";
  }

  return input.sources.some((source) => source === "lastfm_similar" || source === "musicbrainz" || source === "seed")
    ? "needs_verification"
    : "unverified";
}

function isCloseNameMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeComparableName(left);
  const normalizedRight = normalizeComparableName(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return Math.abs(normalizedLeft.length - normalizedRight.length) <= 12;
  }
  return levenshteinDistance(normalizedLeft, normalizedRight) <= 2;
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current[rightIndex + 1] = Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + (left[leftIndex] === right[rightIndex] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Number.POSITIVE_INFINITY;
}

function normalizeComparableName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value?.trim()));
}
