import type { ConcertDateWindows } from "./dateWindows.js";

export interface ConcertSearchArtistIdentity {
  name: string;
  city?: string | null;
  country?: string | null;
  genres?: string[];
  officialWebsite?: string | null;
  spotifyUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
}

/** Deterministic — no randomness, so the same artist/window always produces the same prompt (needed for stable caching). */
export function buildConcertSearchPrompt(artist: ConcertSearchArtistIdentity, windows: ConcertDateWindows): string {
  const identityLines = [
    `- Name: ${artist.name}`,
    artist.genres && artist.genres.length > 0 ? `- Genres: ${artist.genres.join(", ")}` : null,
    artist.city ? `- City: ${artist.city}` : null,
    artist.country ? `- Country: ${artist.country}` : null,
    artist.officialWebsite ? `- Official website: ${artist.officialWebsite}` : null,
    artist.spotifyUrl ? `- Spotify URL: ${artist.spotifyUrl}` : null,
    artist.instagramUrl ? `- Instagram URL: ${artist.instagramUrl}` : null,
    artist.youtubeUrl ? `- YouTube URL: ${artist.youtubeUrl}` : null
  ].filter((line): line is string => Boolean(line));

  return `You are researching live concert performances for a music artist.

Artist identity:
${identityLines.join("\n")}

Search date ranges:
- Past concerts: ${windows.pastStart} to ${windows.pastEnd}
- Upcoming concerts: ${windows.upcomingStart} to ${windows.upcomingEnd}

Find confirmed or credible live concert appearances involving this exact artist.

Search for:
- official artist tour pages;
- official venue calendars and archives;
- official festival programs;
- promoter and association websites;
- ticketing pages;
- cultural agendas;
- credible press articles;
- publicly indexed event announcements.

For every event, extract: event name, date, venue, city, region, country, lineup when available, event type, status, source URLs, source titles, source type, and a concise evidence summary.

Rules:
- Only return events supported by at least one accessible web source.
- Do not invent dates, venues, cities, lineups, URLs or artist identities.
- Do not use a search-result snippet alone as confirmed evidence.
- Prefer official artist, venue, festival, promoter or ticketing sources.
- Distinguish this artist from homonymous artists with the same or similar name.
- Do not state that no concerts exist.
- If no upcoming concerts are found, state only that no upcoming concerts were found in the checked sources.
- Return only data matching the requested schema. Do not write a narrative article. Do not rank venues — extract evidence only.`;
}
