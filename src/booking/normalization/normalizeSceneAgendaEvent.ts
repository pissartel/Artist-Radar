import { matchBookingGenres } from "../genreMatching.js";
import { normalizeBookingSource } from "../normalizeBookingTarget.js";
import type { BookingSearchInput, BookingTarget, RawBookingSource } from "../types.js";

export interface RawSceneAgendaEvent {
  title: string;
  sourceUrl: string | null;
  providerName: string;
  city: string | null;
  country?: string | null;
  description?: string | null;
  eventDate?: string | null;
  lineupArtists?: string[];
  venueName?: string | null;
  genresDetected?: string[];
  confidenceScore?: number;
  imageUrl?: string | null;
}

export function normalizeSceneAgendaEvent(
  input: BookingSearchInput,
  event: RawSceneAgendaEvent
): BookingTarget | null {
  const text = [
    event.title,
    event.description,
    event.venueName,
    ...(event.lineupArtists ?? []),
    event.sourceUrl
  ].filter(Boolean).join(" ");
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], event.genresDetected ?? [], text);
  const raw: RawBookingSource = {
    name: event.title,
    category: inferSceneCategory(text),
    url: event.sourceUrl,
    sourceUrl: event.sourceUrl,
    sourceType: "specialized_scene_agenda",
    sourceProvider: event.providerName,
    city: event.city,
    country: event.country ?? "France",
    text,
    snippet: event.description ?? null,
    genres: uniqueStrings([...(event.genresDetected ?? []), ...genreMatch.matchedGenres]),
    confidence: event.confidenceScore ?? 0.74,
    eventDate: event.eventDate ?? null,
    venueName: event.venueName ?? null,
    lineup: uniqueStrings(event.lineupArtists ?? []),
    imageUrl: event.imageUrl ?? null,
    contacts: []
  };
  const normalized = normalizeBookingSource(raw);
  if (!normalized) return null;

  return {
    ...normalized,
    sourceProvider: event.providerName,
    pastProgramming: uniqueStrings([
      ...(normalized.pastProgramming ?? []),
      ...(event.lineupArtists ?? []),
      event.venueName ?? ""
    ]),
    evidence: uniqueStrings([
      ...normalized.evidence,
      "Normalized from specialized scene agenda.",
      event.venueName ? `Venue detected: ${event.venueName}.` : "",
      event.lineupArtists?.length ? `Lineup artists detected: ${event.lineupArtists.join(", ")}.` : ""
    ])
  };
}

function inferSceneCategory(text: string): RawBookingSource["category"] {
  if (/\b(festival|fest|open air)\b/i.test(text)) return "festival";
  if (/\b(appel à candidature|appel a candidature|tremplin|open call)\b/i.test(text)) return "open_call";
  if (/\b(asso|association|collectif|collective|promoter|orga|organisateur)\b/i.test(text)) return "association";
  return "event";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
