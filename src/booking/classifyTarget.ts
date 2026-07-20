import { extractPublicContactSignals } from "./contactExtraction.js";
import { normalizeLocationParts } from "../utils/location.js";
import type { BookingTarget, BookingTargetCategory, RawBookingSource } from "./types.js";

export function classifyBookingTarget(rawSource: RawBookingSource): BookingTarget {
  const text = buildSourceText(rawSource);
  const category = rawSource.category ?? classifyCategory(text);
  const sourceUrl = rawSource.sourceUrl ?? rawSource.url ?? null;
  const contacts = rawSource.contacts ?? extractPublicContactSignals(text, rawSource.links ?? []);
  const location = normalizeLocationParts(rawSource.city, rawSource.country);

  return {
    name: rawSource.name || rawSource.title || "Unknown booking target",
    category,
    city: location.city,
    country: location.country,
    description: rawSource.text ?? rawSource.snippet ?? null,
    sourceUrl,
    sourceType: rawSource.sourceType ?? "search_result",
    sourceProvider: rawSource.sourceProvider ?? null,
    genres: rawSource.genres ?? [],
    estimatedCapacity: rawSource.estimatedCapacity ?? null,
    estimatedArtistTier: null,
    venueName: rawSource.venueName ?? null,
    lineup: rawSource.lineup ?? [],
    imageUrl: rawSource.imageUrl ?? null,
    eventDate: rawSource.eventDate ?? null,
    isFutureEvent: null,
    isPastEvent: null,
    dateConfidence: null,
    opportunityKind: null,
    ageMonths: null,
    deadline: rawSource.deadline ?? null,
    derivedFromSimilarArtist: rawSource.derivedFromSimilarArtist ?? null,
    contacts,
    confidence: rawSource.confidence ?? 0.5,
    evidence: buildEvidence(rawSource, category),
    recommendedAction: null
  };
}

function classifyCategory(text: string): BookingTargetCategory {
  if (/\b(open call|appel à candidature|appel a candidature|candidatures?|application|apply)\b/i.test(text)) {
    return "open_call";
  }
  if (/\b(springboard|tremplin|concours)\b/i.test(text)) {
    return "springboard";
  }
  if (/\b(festival|fest|open air)\b/i.test(text)) {
    return "festival";
  }
  if (/\b(event|événement|evenement|showcase|support tba|support à venir|support a venir|première partie à venir|premiere partie a venir|guest|line-?up soon)\b/i.test(text)) {
    return "event";
  }
  if (/\b(booking agency|agence de booking|agency)\b/i.test(text)) {
    return "booking_agency";
  }
  if (/\b(live producer|production live|producteur live|organizer|organisateur)\b/i.test(text)) {
    return "live_producer";
  }
  if (/\b(promoter|booker|booking|tourneur)\b/i.test(text)) {
    return "promoter";
  }
  if (/\b(collective|collectif)\b/i.test(text)) {
    return "collective";
  }
  if (/\b(association)\b/i.test(text)) {
    return "association";
  }
  if (/\b(bar|café-concert|cafe-concert|pub)\b/i.test(text)) {
    return "bar";
  }
  if (/\b(venue|salle de concert|concert hall|club)\b/i.test(text)) {
    return "venue";
  }
  return "venue";
}

function buildSourceText(rawSource: RawBookingSource): string {
  return [
    rawSource.name,
    rawSource.title,
    rawSource.text,
    rawSource.snippet,
    rawSource.url,
    ...(rawSource.links ?? [])
  ].filter(Boolean).join(" ");
}

function buildEvidence(rawSource: RawBookingSource, category: BookingTargetCategory): string[] {
  const evidence = [`Classified as ${category}.`];
  if (rawSource.sourceUrl ?? rawSource.url) {
    evidence.push("Public source URL available.");
  }
  if (rawSource.genres && rawSource.genres.length > 0) {
    evidence.push(`Genre clues: ${rawSource.genres.join(", ")}.`);
  }
  return evidence;
}
