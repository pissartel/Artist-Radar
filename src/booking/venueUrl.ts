// A venue opportunity discovered from a similar artist's past/upcoming
// concert must represent the venue itself, never the concert that surfaced
// it — the concert is only evidence that the venue is compatible. This
// module centralizes the URL-classification/resolution rules every producer
// of a `category: "venue"` BookingTarget (OpenAI concert discovery,
// structured concert-history discovery, web-search discovery) and the
// shared normalization layer (classifyTarget.ts) must apply so a venue's
// primary sourceUrl is never an individual event/ticket/artist/listing page.
import { isSocialOrTicketingUrl } from "./eventPageExtraction.js";

// Domains that are always an aggregator/discovery/ticketing source, never a
// venue's own official site — kept in sync with the frontend's own
// NON_VENUE_WEBSITE_DOMAINS list (frontend/src/lib/server/artistRadarMapper.ts)
// so both layers apply the same policy.
const NON_VENUE_WEBSITE_DOMAINS = [
  "songkick.com",
  "bandsintown.com",
  "setlist.fm",
  "shotgun.live",
  "dice.fm",
  "ra.co",
  "residentadvisor.net",
  "ticketmaster.com",
  "ticketmaster.fr",
  "eventbrite.com",
  "eventbrite.fr",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "last.fm",
  "allevents.in",
  "wegow.com"
];

// Path segments identifying an artist profile, event listing, calendar, or
// ticketing page rather than a venue's own homepage.
const EVENT_LIKE_PATH_PATTERN = /\/(artists?|events?|calendar|tickets?|billetterie|billets|e|tour)(\/|$)/i;

// A single dated event permalink slug, e.g. razibus.net's
// "/19-08-2026-the-tensions-karkass-....html" — a specific concert page,
// never a venue's own homepage.
const DATED_EVENT_SLUG_PATTERN = /\/\d{1,2}-\d{1,2}-\d{4}-/;

/** True when a URL looks like it points at one specific event/ticket/artist page rather than a venue's own homepage. Fails safe: a malformed URL is treated as event-like (never trusted as a venue site). */
export function isLikelyEventUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./i, "");
    if (isSocialOrTicketingUrl(url)) return true;
    if (NON_VENUE_WEBSITE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) return true;
    if (EVENT_LIKE_PATH_PATTERN.test(parsed.pathname)) return true;
    if (DATED_EVENT_SLUG_PATTERN.test(parsed.pathname)) return true;
    return false;
  } catch {
    return true;
  }
}

/** True when a URL is plausibly a venue's own page — the inverse of isLikelyEventUrl, plus a null/undefined guard. Never a guarantee the URL is correct, only that it isn't an obviously-wrong event/ticket/social link. */
export function isLikelyVenueUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return !isLikelyEventUrl(url);
}

export interface VenueUrlCandidate {
  url: string | null | undefined;
  /** Independently identified as the venue's own official site/programming page (as opposed to merely "not obviously an event page"). */
  verified?: boolean;
}

/**
 * Resolves a venue's primary URL from a list of candidates, following the
 * priority order: a verified, venue-shaped candidate first; then any other
 * venue-shaped candidate; never an event-shaped URL (e.g. the concert that
 * surfaced this venue); `null` — never a guess — when nothing qualifies.
 */
export function resolveVenueOfficialUrl(candidates: VenueUrlCandidate[]): string | null {
  const venueShaped = candidates.filter((candidate) => isLikelyVenueUrl(candidate.url));
  const verified = venueShaped.find((candidate) => candidate.verified);
  return verified?.url ?? venueShaped[0]?.url ?? null;
}
