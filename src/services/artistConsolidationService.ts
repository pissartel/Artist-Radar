import type {
  ArtistProfile,
  GenreEvidence,
  LocationEvidence,
  SizeEvidence
} from "../schemas.js";
import { extractInstagramHandles } from "../modules/instagramHandleExtractor.js";
import { debugLog } from "../utils/logger.js";
import { searchSpotifyArtists, type SpotifyArtistProfile } from "./spotifyService.js";
import { getLastFmArtistInfo, type LastFmArtistInfo } from "./lastfmService.js";
import { enrichArtistWithMusicBrainz, type MusicBrainzArtistMetadata } from "./musicBrainzService.js";
import { getYouTubeChannelStats, type YouTubeChannelStats } from "./youtubeService.js";
import type { ArtistVerificationStatus, WebSearchProvider, WebSearchResult } from "./artistVerificationService.js";
import { buildFirecrawlWebSearchProvider, type FirecrawlEnv } from "./firecrawlService.js";

export interface ArtistConsolidationCandidate {
  name: string;
  spotifyUrl?: string | null;
  spotifyId?: string | null;
  instagramUrl?: string | null;
  instagramHandle?: string | null;
  youtubeUrl?: string | null;
  youtubeChannelId?: string | null;
  youtubeSubscribers?: number | null;
  youtubeTotalViews?: number | null;
  youtubeVideoCount?: number | null;
  genres: string[];
  city?: string | null;
  country?: string | null;
  sources: string[];
  sourceUrls?: string[];
  evidenceNotes?: string[];
  genreEvidence?: GenreEvidence[];
  locationEvidence?: LocationEvidence[];
  sizeEvidence?: SizeEvidence[];
  followersCount?: number | null;
  popularity?: number | null;
  musicBrainzId?: string | null;
}

export interface ArtistConsolidationContext {
  profile: ArtistProfile;
  userGenres: string[];
  city?: string | null;
  target?: string | null;
  spotifySearch?: (query: string, limit: number) => Promise<SpotifyArtistProfile[]>;
  lastfmArtistInfo?: (artistName: string) => Promise<LastFmArtistInfo | null>;
  musicBrainzSearch?: (artistName: string) => Promise<MusicBrainzArtistMetadata | null>;
  webSearchProvider?: WebSearchProvider | null;
  youtubeChannelStats?: (youtubeUrl: string) => Promise<YouTubeChannelStats | null>;
  env?: FirecrawlEnv & {
    LASTFM_API_KEY?: string;
    SPOTIFY_CLIENT_ID?: string;
    SPOTIFY_CLIENT_SECRET?: string;
    APP_USER_AGENT?: string;
    YOUTUBE_API_KEY?: string;
    DEBUG_ARTIST_CONSOLIDATION?: string;
  };
}

export interface ArtistConsolidationResult {
  spotifyUrl: string | null;
  spotifyId: string | null;
  instagramUrl: string | null;
  instagramHandle: string | null;
  youtubeUrl: string | null;
  youtubeChannelId: string | null;
  youtubeSubscribers: number | null;
  youtubeTotalViews: number | null;
  youtubeVideoCount: number | null;
  genres: string[];
  city: string | null;
  country: string | null;
  verificationStatus: ArtistVerificationStatus;
  genreEvidence: GenreEvidence[];
  locationEvidence: LocationEvidence[];
  sizeEvidence: SizeEvidence[];
  sourceUrls: string[];
  evidenceNotes: string[];
}

export async function consolidateArtistCandidate(
  candidate: ArtistConsolidationCandidate,
  context: ArtistConsolidationContext
): Promise<ArtistConsolidationResult> {
  let spotifyUrl = candidate.spotifyUrl ?? null;
  let spotifyId = candidate.spotifyId ?? null;
  let instagramUrl = candidate.instagramUrl ?? null;
  let instagramHandle = candidate.instagramHandle ?? null;
  let youtubeUrl = candidate.youtubeUrl ?? null;
  let youtubeChannelId = candidate.youtubeChannelId ?? null;
  let youtubeSubscribers = candidate.youtubeSubscribers ?? null;
  let youtubeTotalViews = candidate.youtubeTotalViews ?? null;
  let youtubeVideoCount = candidate.youtubeVideoCount ?? null;
  let city = candidate.city ?? null;
  let country = candidate.country ?? null;
  const genres = uniqueStrings(candidate.genres);
  const sourceUrls = uniqueStrings(candidate.sourceUrls ?? []);
  const evidenceNotes = uniqueStrings(candidate.evidenceNotes ?? []);
  const genreEvidence: GenreEvidence[] = [...(candidate.genreEvidence ?? [])];
  const locationEvidence: LocationEvidence[] = [...(candidate.locationEvidence ?? [])];
  const sizeEvidence: SizeEvidence[] = [...(candidate.sizeEvidence ?? [])];

  debugLog("artist-consolidation", "candidate selected for consolidation", {
    name: candidate.name,
    sources: candidate.sources
  });

  if (!spotifyId) {
    const spotifySearch = context.spotifySearch ?? ((query: string, limit: number) => searchSpotifyArtists(query, limit, context.env));
    const spotifyMatch = pickExactSpotifyMatch(candidate.name, await spotifySearch(candidate.name, 5));
    if (spotifyMatch) {
      spotifyId = spotifyMatch.id;
      spotifyUrl = spotifyMatch.spotifyUrl;
      sourceUrls.push(...compactStrings([spotifyMatch.spotifyUrl]));
      genres.push(...spotifyMatch.genres);
      if (spotifyMatch.genres.length > 0) {
        genreEvidence.push({
          source: "spotify",
          genres: spotifyMatch.genres,
          confidence: 0.72,
          notes: "Spotify exact-name identity match.",
          sourceUrl: spotifyMatch.spotifyUrl
        });
      }
      evidenceNotes.push(`Spotify exact-name match: ${spotifyMatch.name}.`);
    }
    debugLog("artist-consolidation", "Spotify verification result", {
      name: candidate.name,
      matched: Boolean(spotifyMatch),
      spotifyId: spotifyMatch?.id ?? null
    });
  }

  if (candidate.sources.includes("lastfm_similar")) {
    const lastfmInfo = await (context.lastfmArtistInfo ?? ((name: string) => getLastFmArtistInfo(name, context.env)))(candidate.name);
    if (lastfmInfo) {
      sourceUrls.push(...compactStrings([lastfmInfo.url]));
      genres.push(...lastfmInfo.tags);
      if (lastfmInfo.tags.length > 0) {
        genreEvidence.push({
          source: "lastfm",
          genres: lastfmInfo.tags,
          confidence: 0.76,
          notes: "Last.fm artist tags.",
          sourceUrl: lastfmInfo.url
        });
      }
      if (lastfmInfo.listeners !== null || lastfmInfo.playcount !== null) {
        sizeEvidence.push({
          source: "lastfm",
          followers: lastfmInfo.listeners,
          views: lastfmInfo.playcount,
          confidence: 0.45,
          notes: "Last.fm listeners/playcount; useful as rough size evidence only.",
          sourceUrl: lastfmInfo.url
        });
      }
      evidenceNotes.push("Last.fm artist info enriched candidate.");
    }
    debugLog("artist-consolidation", "Last.fm getInfo result", {
      name: candidate.name,
      found: Boolean(lastfmInfo),
      tagsCount: lastfmInfo?.tags.length ?? 0
    });
  }

  const musicBrainzInfo = await (context.musicBrainzSearch ?? ((name: string) => enrichArtistWithMusicBrainz(name, context.env)))(candidate.name);
  if (musicBrainzInfo) {
    sourceUrls.push(...compactStrings([musicBrainzInfo.sourceUrl]));
    genres.push(...musicBrainzInfo.tags);
    city = city ?? musicBrainzInfo.beginArea ?? musicBrainzInfo.area ?? null;
    country = country ?? musicBrainzInfo.country ?? null;
    if (musicBrainzInfo.tags.length > 0) {
      genreEvidence.push({
        source: "musicbrainz",
        genres: musicBrainzInfo.tags,
        confidence: 0.72,
        notes: `MusicBrainz matched ${musicBrainzInfo.name}.`,
        sourceUrl: musicBrainzInfo.sourceUrl
      });
    }
    if (musicBrainzInfo.country || musicBrainzInfo.beginArea || musicBrainzInfo.area) {
      locationEvidence.push({
        source: "musicbrainz",
        city: musicBrainzInfo.beginArea ?? musicBrainzInfo.area ?? null,
        country: musicBrainzInfo.country ?? null,
        confidence: 0.72,
        notes: `MusicBrainz matched ${musicBrainzInfo.name}.`,
        sourceUrl: musicBrainzInfo.sourceUrl
      });
    }
    evidenceNotes.push("MusicBrainz metadata enriched candidate.");
  }
  debugLog("artist-consolidation", "MusicBrainz enrichment result", {
    name: candidate.name,
    found: Boolean(musicBrainzInfo),
    country: musicBrainzInfo?.country ?? null,
    tagsCount: musicBrainzInfo?.tags.length ?? 0
  });

  const webSearchProvider = context.webSearchProvider ?? buildFirecrawlWebSearchProvider(context.env);
  debugLog("artist-consolidation", "web search availability", {
    name: candidate.name,
    enabled: Boolean(webSearchProvider)
  });
  if (webSearchProvider) {
    const primaryGenre = context.userGenres[0] ?? genres[0] ?? null;
    const { entries: resultsByQuery, failedCount } = await searchCandidateWebResults(webSearchProvider, buildWebSearchQueries(candidate.name, primaryGenre));
    if (failedCount > 0) {
      evidenceNotes.push("Firecrawl search failed; candidate still needs verification.");
    }
    const webResults = resultsByQuery.flatMap((entry) => entry.results);

    if (!spotifyUrl) {
      const spotifyMatch = findSpotifyUrlFromWebResults(webResults);
      if (spotifyMatch) {
        spotifyUrl = spotifyMatch.url;
        spotifyId = spotifyId ?? extractSpotifyArtistIdFromUrl(spotifyMatch.url);
        sourceUrls.push(spotifyMatch.sourceUrl);
        evidenceNotes.push("Spotify URL found from public web/search result.");
      }
      debugLog("artist-consolidation", "Spotify URL discovery", {
        name: candidate.name,
        found: Boolean(spotifyMatch),
        spotifyId: spotifyId ?? null
      });
    }

    const webGenreEvidence = extractGenreEvidenceFromWebResults(webResults, candidate.name);
    if (webGenreEvidence.length > 0) {
      genreEvidence.push(...webGenreEvidence);
      genres.push(...webGenreEvidence.flatMap((entry) => entry.genres));
      evidenceNotes.push("Genre evidence found from public web/search result.");
    }

    const webLocationEvidence = extractLocationEvidenceFromWebResults(webResults, candidate.name);
    if (webLocationEvidence.length > 0) {
      locationEvidence.push(...webLocationEvidence);
      country = country ?? webLocationEvidence.find((entry) => entry.country)?.country ?? null;
      city = city ?? webLocationEvidence.find((entry) => entry.city && entry.city !== "France")?.city ?? null;
      evidenceNotes.push("Location evidence found from public web/search result.");
    }

    const webSizeEvidence = extractSizeEvidenceFromWebResults(webResults, candidate.name);
    if (webSizeEvidence.length > 0) {
      sizeEvidence.push(...webSizeEvidence);
      evidenceNotes.push("Size evidence found from public web/search result.");
    }

    debugLog("firecrawl", "extracted links/evidence", {
      name: candidate.name,
      spotifyUrlFound: Boolean(spotifyUrl),
      instagramUrlFound: Boolean(instagramUrl),
      youtubeUrlFound: Boolean(youtubeUrl),
      genreEvidenceCount: webGenreEvidence.length,
      locationEvidenceCount: webLocationEvidence.length,
      sizeEvidenceCount: webSizeEvidence.length,
      sourceUrls: sourceUrls.filter(Boolean)
    });

    if (!instagramUrl) {
      const instagramMatch = findInstagramFromWebResults(webResults);
      if (instagramMatch) {
        instagramUrl = instagramMatch.url;
        instagramHandle = instagramMatch.handle;
        sourceUrls.push(instagramMatch.sourceUrl);
        evidenceNotes.push(`Instagram handle found from public web/search result: ${instagramMatch.handle}.`);
      }
      debugLog("artist-consolidation", "Instagram URL discovery", {
        name: candidate.name,
        found: Boolean(instagramMatch),
        instagramHandle: instagramMatch?.handle ?? null
      });
    }

    if (!youtubeUrl) {
      const youtubeMatch = findYouTubeUrlFromWebResults(webResults);
      if (youtubeMatch) {
        youtubeUrl = youtubeMatch;
        sourceUrls.push(youtubeMatch);
        evidenceNotes.push("YouTube URL found from public web/search result.");
      }
      debugLog("artist-consolidation", "YouTube URL discovery", {
        name: candidate.name,
        found: Boolean(youtubeMatch),
        youtubeUrl: youtubeMatch ?? null
      });
    }
  }

  if (youtubeUrl) {
    const stats = await (context.youtubeChannelStats ?? ((url: string) => getYouTubeChannelStats(url, context.env)))(youtubeUrl);
    if (stats) {
      youtubeChannelId = stats.youtubeChannelId;
      youtubeSubscribers = stats.youtubeSubscribers;
      youtubeTotalViews = stats.youtubeTotalViews;
      youtubeVideoCount = stats.youtubeVideoCount;
      sizeEvidence.push({
        source: "youtube",
        subscribers: stats.youtubeSubscribers,
        views: stats.youtubeTotalViews,
        confidence: 0.82,
        notes: "YouTube channel statistics.",
        sourceUrl: stats.youtubeUrl
      });
      evidenceNotes.push("YouTube channel stats enriched candidate.");
    }
    debugLog("artist-consolidation", "YouTube stats result", {
      name: candidate.name,
      found: Boolean(stats),
      youtubeChannelId: stats?.youtubeChannelId ?? null
    });
  }

  const finalGenres = uniqueStrings(genres);
  const finalSourceUrls = uniqueStrings(sourceUrls);
  const verificationStatus = determineConsolidatedVerificationStatus({
    spotifyUrl,
    instagramUrl,
    youtubeUrl,
    musicBrainzId: musicBrainzInfo?.musicBrainzId ?? candidate.musicBrainzId ?? null,
    genreEvidence,
    locationEvidence,
    sources: candidate.sources
  });

  debugLog("artist-consolidation", "final consolidation result", {
    name: candidate.name,
    genreEvidenceCount: genreEvidence.length,
    locationEvidenceCount: locationEvidence.length,
    sizeEvidenceCount: sizeEvidence.length,
    verificationStatus
  });

  return {
    spotifyUrl,
    spotifyId,
    instagramUrl,
    instagramHandle,
    youtubeUrl,
    youtubeChannelId,
    youtubeSubscribers,
    youtubeTotalViews,
    youtubeVideoCount,
    genres: finalGenres,
    city,
    country,
    verificationStatus,
    genreEvidence: dedupeEvidenceBySourceAndUrl(genreEvidence),
    locationEvidence: dedupeEvidenceBySourceAndUrl(locationEvidence),
    sizeEvidence: dedupeEvidenceBySourceAndUrl(sizeEvidence),
    sourceUrls: finalSourceUrls,
    evidenceNotes: uniqueStrings(evidenceNotes)
  };
}

function pickExactSpotifyMatch(candidateName: string, matches: SpotifyArtistProfile[]): SpotifyArtistProfile | null {
  const normalizedCandidateName = normalizeComparableName(candidateName);
  return matches.find((match) => normalizeComparableName(match.name) === normalizedCandidateName) ?? null;
}

function buildWebSearchQueries(artistName: string, primaryGenre: string | null): string[] {
  return uniqueStrings([
    primaryGenre ? `"${artistName}" "${primaryGenre}" band` : "",
    `"${artistName}" "pop punk"`,
    `"${artistName}" "punk rock"`,
    `"${artistName}" Instagram`,
    `"${artistName}" Spotify`,
    `"${artistName}" YouTube`,
    `"${artistName}" official`,
    `"${artistName}" France band`,
    `"${artistName}" band Instagram`,
    primaryGenre ? `"${artistName}" "${primaryGenre}" Instagram` : "",
    `"${artistName}" band YouTube`,
    primaryGenre ? `"${artistName}" "${primaryGenre}" YouTube` : ""
  ]);
}

async function searchCandidateWebResults(
  provider: WebSearchProvider,
  queries: string[]
): Promise<{ entries: Array<{ query: string; results: WebSearchResult[] }>; failedCount: number }> {
  debugLog("firecrawl", "Firecrawl consolidation search queries generated", {
    queries
  });
  const entries = [];
  let failedCount = 0;
  for (const query of queries) {
    try {
      const results = await provider.search(query, 5);
      debugLog("firecrawl", "Firecrawl consolidation query result count", {
        query,
        resultCount: results.length
      });
      entries.push({ query, results });
    } catch (error) {
      failedCount += 1;
      debugLog("firecrawl", "Firecrawl consolidation query failed", {
        query,
        errorName: error instanceof Error ? error.name : "Error",
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      entries.push({ query, results: [] });
    }
  }
  return { entries, failedCount };
}

function findSpotifyUrlFromWebResults(results: WebSearchResult[]): { url: string; sourceUrl: string } | null {
  for (const result of results) {
    const urls = extractUrlsFromWebResult(result);
    const spotifyUrl = urls.find((url) => isSpotifyArtistUrl(url));
    if (spotifyUrl && hasReasonableNameConfidence(result, spotifyUrl)) {
      return { url: normalizeUrl(spotifyUrl), sourceUrl: result.url ?? spotifyUrl };
    }
  }
  return null;
}

function findInstagramFromWebResults(results: WebSearchResult[]): { handle: string; url: string; sourceUrl: string } | null {
  for (const result of results) {
    const content = buildWebResultText(result);
    const handles = extractInstagramHandles({ content, sourceUrl: result.url });
    const match = handles.find((handle) => handle.confidence >= 0.75);
    if (match?.sourceUrl) {
      return { handle: match.handle, url: match.url, sourceUrl: match.sourceUrl };
    }
  }
  return null;
}

function findYouTubeUrlFromWebResults(results: WebSearchResult[]): string | null {
  for (const result of results) {
    const normalized = extractUrlsFromWebResult(result).map(normalizeYouTubeCandidateUrl).find((url) => url !== null);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function extractGenreEvidenceFromWebResults(results: WebSearchResult[], artistName: string): GenreEvidence[] {
  const compatibleGenres = [
    "pop punk",
    "punk rock",
    "skate punk",
    "melodic punk",
    "easycore",
    "emo pop",
    "post-hardcore",
    "punk",
    "emo"
  ];
  return results.flatMap((result) => {
    if (!hasReasonableNameConfidence(result, artistName)) {
      return [];
    }
    const text = buildWebResultText(result).toLowerCase();
    const genres = compatibleGenres.filter((genre) => new RegExp(`\\b${escapeRegExp(genre)}\\b`, "i").test(text));
    if (genres.length === 0) {
      return [];
    }
    if ((genres.includes("pop") && genres.length === 1) || (genres.includes("rock") && genres.length === 1)) {
      return [];
    }
    return [{
      source: "firecrawl",
      genres: uniqueStrings(genres),
      confidence: result.markdown ? 0.78 : 0.68,
      notes: "Explicit compatible genre clue from public web/search result.",
      sourceUrl: result.url
    }];
  });
}

function extractLocationEvidenceFromWebResults(results: WebSearchResult[], artistName: string): LocationEvidence[] {
  const cityNames = ["Paris", "Lyon", "Bordeaux", "Nantes", "Lille", "Rennes", "Toulouse", "Marseille", "Strasbourg"];
  return results.flatMap((result) => {
    if (!hasReasonableNameConfidence(result, artistName)) {
      return [];
    }
    const text = buildWebResultText(result);
    const country = /\b(france|french band|french pop punk|french punk)\b/i.test(text) ? "France" : null;
    const city = cityNames.find((cityName) => new RegExp(`\\b${escapeRegExp(cityName)}\\b`, "i").test(text)) ?? null;
    if (!country && !city) {
      return [];
    }
    return [{
      source: "firecrawl",
      city,
      country,
      confidence: result.markdown ? 0.74 : 0.64,
      notes: "Location clue from public web/search result.",
      sourceUrl: result.url
    }];
  });
}

function extractSizeEvidenceFromWebResults(results: WebSearchResult[], artistName: string): SizeEvidence[] {
  return results.flatMap((result) => {
    if (!hasReasonableNameConfidence(result, artistName)) {
      return [];
    }
    const text = buildWebResultText(result);
    const instagramFollowers = extractCountBeforeLabel(text, /(instagram\s+)?followers/i);
    const subscribers = extractCountBeforeLabel(text, /subscribers/i);
    const views = extractCountBeforeLabel(text, /views/i);
    if (instagramFollowers === null && subscribers === null && views === null) {
      return [];
    }
    return [{
      source: "firecrawl",
      followers: instagramFollowers,
      subscribers,
      views,
      confidence: 0.58,
      notes: "Explicit size clue from public web/search result.",
      sourceUrl: result.url
    }];
  });
}

function extractCountBeforeLabel(text: string, label: RegExp): number | null {
  const match = text.match(new RegExp(`(\\d[\\d,.]*\\s*[kKmM]?)\\s+${label.source}`, "i"));
  if (!match?.[1]) {
    return null;
  }
  return parseCompactCount(match[1]);
}

function parseCompactCount(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  const multiplier = /k$/i.test(normalized) ? 1000 : /m$/i.test(normalized) ? 1_000_000 : 1;
  const numeric = Number.parseFloat(normalized.replace(/[kKmM]$/, ""));
  return Number.isFinite(numeric) ? Math.round(numeric * multiplier) : null;
}

function extractUrlsFromWebResult(result: WebSearchResult): string[] {
  const text = buildWebResultText(result);
  const urls = text.match(/https?:\/\/[^\s"'<>)]*/gi) ?? [];
  return uniqueStrings([...compactStrings([result.url]), ...(result.links ?? []), ...urls]);
}

function buildWebResultText(result: WebSearchResult): string {
  return compactStrings([result.url, result.title, result.snippet, result.markdown, ...(result.links ?? [])]).join(" ");
}

function isSpotifyArtistUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "") === "open.spotify.com" && url.pathname.split("/").filter(Boolean)[0] === "artist";
  } catch {
    return false;
  }
}

function extractSpotifyArtistIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    return segments[0] === "artist" && segments[1] ? segments[1] : null;
  } catch {
    return null;
  }
}

function hasReasonableNameConfidence(result: WebSearchResult, expected: string): boolean {
  const normalizedExpected = normalizeComparableName(expected);
  const haystack = normalizeComparableName(compactStrings([result.title, result.snippet, result.url, result.markdown]).join(" "));
  return normalizedExpected.length > 0 && haystack.includes(normalizedExpected);
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function determineConsolidatedVerificationStatus(input: {
  spotifyUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  musicBrainzId: string | null;
  genreEvidence: GenreEvidence[];
  locationEvidence: LocationEvidence[];
  sources: string[];
}): ArtistVerificationStatus {
  if (input.spotifyUrl || input.instagramUrl || input.youtubeUrl || input.musicBrainzId) {
    return "verified";
  }
  if (input.genreEvidence.length > 0 || input.locationEvidence.length > 0 || input.sources.includes("lastfm_similar")) {
    return "needs_verification";
  }
  return "unverified";
}

function dedupeEvidenceBySourceAndUrl<T extends { source: string; sourceUrl?: string | null }>(evidence: T[]): T[] {
  const seen = new Set<string>();
  return evidence.filter((entry) => {
    const key = `${entry.source}:${entry.sourceUrl ?? ""}:${JSON.stringify(entry)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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
