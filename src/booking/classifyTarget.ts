import { extractPublicContactSignals } from "./contactExtraction.js";
import { normalizeLocationParts } from "../utils/location.js";
import type { BookingTarget, BookingTargetCategory, RawBookingSource } from "./types.js";

export function classifyBookingTarget(rawSource: RawBookingSource): BookingTarget {
  const text = buildSourceText(rawSource);
  const sourceUrl = rawSource.sourceUrl ?? rawSource.url ?? null;
  const sourceType = rawSource.sourceType ?? "search_result";
  const category =
    rawSource.category ?? classifyCategory(text, { hasVenueName: Boolean(rawSource.venueName), isUnverifiedSearchResult: sourceType === "search_result" });
  const contacts = rawSource.contacts ?? extractPublicContactSignals(text, rawSource.links ?? []);
  const location = normalizeLocationParts(rawSource.city, rawSource.country);

  return {
    name: rawSource.name || rawSource.title || "Unknown booking target",
    category,
    city: location.city,
    country: location.country,
    description: rawSource.text ?? rawSource.snippet ?? null,
    sourceUrl,
    sourceType,
    sourceProvider: rawSource.sourceProvider ?? null,
    genres: rawSource.genres ?? [],
    estimatedCapacity: rawSource.estimatedCapacity ?? null,
    estimatedArtistTier: null,
    venueName: rawSource.venueName ?? null,
    lineup: rawSource.lineup ?? [],
    imageUrl: rawSource.imageUrl ?? null,
    imageSource: rawSource.imageSource ?? null,
    address: rawSource.address ?? null,
    ticketUrl: rawSource.ticketUrl ?? null,
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

function classifyCategory(text: string, context: { hasVenueName: boolean; isUnverifiedSearchResult: boolean }): BookingTargetCategory {
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
  // Nothing in the text names a venue, and this is a bare, unverified web-
  // search result (no page extraction ever ran or resolved a real venue
  // identity for it — see extractVenuePageData in eventPageExtraction.ts,
  // whose output always sets venueName when it succeeds). Defaulting to
  // "venue" here would (a) let the raw search-result title/URL — often a
  // social-media post or a third-party listing page about one specific show,
  // e.g. an Instagram post or a generic "lagenda"-style aggregator — be
  // shown as if it were a real venue's own name/website downstream (see
  // mapVenueWebsite in the frontend mapper), and (b) let it bypass the
  // ordinary event-date relevance filter by being treated as an evergreen
  // venue that needs no date. Falling through to "event" instead means it's
  // judged like any other one-off event lead: it simply won't surface at all
  // without a real date or high confidence, rather than surfacing under a
  // fabricated venue identity.
  if (!context.hasVenueName && context.isUnverifiedSearchResult) {
    return "event";
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
