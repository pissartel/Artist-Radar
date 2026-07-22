import { toDateOnlyString } from "../../utils/dateOnly.js";

export interface TicketmasterConcert {
  provider: "ticketmaster";
  eventId: string;
  name: string;
  url?: string;
  date: {
    localDate: string;
    localTime?: string;
    dateTime?: string;
    timezone?: string;
  };
  status: "past" | "upcoming" | "cancelled" | "postponed" | "rescheduled" | "unknown";
  venue?: {
    ticketmasterId?: string;
    name: string;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    address?: string | null;
    postalCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    url?: string;
  };
  attractions: Array<{ ticketmasterId?: string; name: string; isMainAttraction?: boolean }>;
  classifications?: Array<{ segment?: string; genre?: string; subGenre?: string }>;
  promoter?: { name?: string; description?: string };
  sales?: { publicStartDateTime?: string; publicEndDateTime?: string; status?: string };
  images?: Array<{ url: string; ratio?: string; width?: number; height?: number }>;
  /** Detected separately from booking-target category: festivals are never treated as a normal venue support-slot opportunity. */
  eventType: "concert" | "festival" | "tour_date" | "unknown";
  sourceRetrievedAt: string;
}

export interface LineupAssessment {
  listedArtistCount: number;
  lineupCompleteness: "partial" | "possibly_complete" | "unknown";
  supportSlotSignal: "possible" | "unlikely" | "unknown";
  explanation: string;
}

interface TicketmasterVenueApi {
  id?: string;
  name?: string;
  city?: { name?: string };
  state?: { name?: string };
  country?: { name?: string };
  address?: { line1?: string };
  postalCode?: string;
  location?: { longitude?: string; latitude?: string };
  url?: string;
}

interface TicketmasterAttractionEmbedApi {
  id?: string;
  name?: string;
}

interface TicketmasterClassificationApi {
  primary?: boolean;
  segment?: { name?: string };
  genre?: { name?: string };
  subGenre?: { name?: string };
}

export interface TicketmasterEventApi {
  id?: string;
  name?: string;
  url?: string;
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string };
    timezone?: string;
    status?: { code?: string };
  };
  classifications?: TicketmasterClassificationApi[];
  promoter?: { name?: string; description?: string };
  sales?: { public?: { startDateTime?: string; endDateTime?: string } };
  images?: Array<{ url?: string; ratio?: string; width?: number; height?: number }>;
  _embedded?: {
    venues?: TicketmasterVenueApi[];
    attractions?: TicketmasterAttractionEmbedApi[];
  };
}

const FESTIVAL_NAME_PATTERN = /\bfest(ival)?\b/i;
const TOUR_NAME_PATTERN = /\btour\b/i;
const FESTIVAL_ATTRACTION_COUNT_THRESHOLD = 4;

/**
 * Raw Ticketmaster event JSON -> TicketmasterConcert. Returns null when the
 * event lacks the minimum evidence needed to be usable (no id, name or
 * date) rather than fabricating placeholder values.
 */
export function normalizeTicketmasterEvent(raw: TicketmasterEventApi, now: Date = new Date()): TicketmasterConcert | null {
  const eventId = raw.id;
  const name = raw.name?.trim();
  const localDate = raw.dates?.start?.localDate;
  if (!eventId || !name || !localDate) {
    return null;
  }

  const venueApi = raw._embedded?.venues?.[0];
  const attractionsApi = raw._embedded?.attractions ?? [];

  const venue = venueApi?.name
    ? {
        ticketmasterId: venueApi.id,
        name: venueApi.name,
        city: venueApi.city?.name ?? null,
        region: venueApi.state?.name ?? null,
        country: venueApi.country?.name ?? null,
        address: venueApi.address?.line1 ?? null,
        postalCode: venueApi.postalCode ?? null,
        latitude: toFiniteNumber(venueApi.location?.latitude),
        longitude: toFiniteNumber(venueApi.location?.longitude),
        url: venueApi.url
      }
    : undefined;

  const attractions = attractionsApi.flatMap((attraction, index) => {
    if (!attraction.name) {
      return [];
    }
    return [{ ticketmasterId: attraction.id, name: attraction.name, isMainAttraction: index === 0 }];
  });

  const classifications = (raw.classifications ?? []).flatMap((classification) => {
    const segment = classification.segment?.name;
    const genre = classification.genre?.name;
    const subGenre = classification.subGenre?.name;
    if (!segment && !genre && !subGenre) {
      return [];
    }
    return [{ segment, genre, subGenre }];
  });

  return {
    provider: "ticketmaster",
    eventId,
    name,
    url: raw.url,
    date: {
      localDate,
      localTime: raw.dates?.start?.localTime,
      dateTime: raw.dates?.start?.dateTime,
      timezone: raw.dates?.timezone
    },
    status: classifyEventStatus(localDate, raw.dates?.status?.code, now),
    venue,
    attractions,
    classifications: classifications.length > 0 ? classifications : undefined,
    promoter: raw.promoter?.name ? { name: raw.promoter.name, description: raw.promoter.description } : undefined,
    sales: raw.sales?.public
      ? { publicStartDateTime: raw.sales.public.startDateTime, publicEndDateTime: raw.sales.public.endDateTime }
      : undefined,
    images: (raw.images ?? []).flatMap((image) =>
      image.url ? [{ url: image.url, ratio: image.ratio, width: image.width, height: image.height }] : []
    ),
    eventType: classifyEventType(name, attractions.length),
    sourceRetrievedAt: now.toISOString()
  };
}

function classifyEventStatus(
  localDate: string,
  statusCode: string | undefined,
  now: Date
): TicketmasterConcert["status"] {
  const normalized = statusCode?.trim().toLowerCase();
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "postponed") return "postponed";
  if (normalized === "rescheduled") return "rescheduled";

  const dateOnly = toDateOnlyString(localDate);
  const nowOnly = toDateOnlyString(now);
  if (!dateOnly || !nowOnly) {
    return "unknown";
  }
  return dateOnly >= nowOnly ? "upcoming" : "past";
}

function classifyEventType(name: string, attractionCount: number): TicketmasterConcert["eventType"] {
  if (FESTIVAL_NAME_PATTERN.test(name) || attractionCount >= FESTIVAL_ATTRACTION_COUNT_THRESHOLD) {
    return "festival";
  }
  if (TOUR_NAME_PATTERN.test(name)) {
    return "tour_date";
  }
  if (attractionCount >= 1) {
    return "concert";
  }
  return "unknown";
}

/**
 * Turns raw lineup data into a hedged, explained signal — never a
 * confirmed "support slot available" claim (issue #189). A `possible`
 * signal is a heuristic prioritization hint for further research, not an
 * opportunity in itself.
 */
export function assessLineup(event: TicketmasterConcert, now: Date = new Date()): LineupAssessment {
  const listedArtistCount = event.attractions.length;

  if (event.eventType === "festival") {
    return {
      listedArtistCount,
      lineupCompleteness: listedArtistCount > 1 ? "partial" : "unknown",
      supportSlotSignal: "unknown",
      explanation: "Festival or multi-day event: not evaluated as a standalone venue support-slot opportunity."
    };
  }

  if (listedArtistCount >= 2) {
    return {
      listedArtistCount,
      lineupCompleteness: "possibly_complete",
      supportSlotSignal: "unlikely",
      explanation: `${listedArtistCount} attractions are already listed for this event, so an open support slot is unlikely.`
    };
  }

  if (listedArtistCount === 1) {
    if (event.status !== "upcoming") {
      return {
        listedArtistCount,
        lineupCompleteness: "unknown",
        supportSlotSignal: "unknown",
        explanation: "Only one attraction is listed and the event is not upcoming, so a support-slot signal does not apply."
      };
    }
    if (monthsUntil(event.date.localDate, now) >= 1) {
      return {
        listedArtistCount,
        lineupCompleteness: "unknown",
        supportSlotSignal: "possible",
        explanation: "Only one attraction is currently listed for a future event. Ticketmaster lineups may be incomplete, so this is not confirmation of an available support slot."
      };
    }
    return {
      listedArtistCount,
      lineupCompleteness: "unknown",
      supportSlotSignal: "unlikely",
      explanation: "Only one attraction is listed and the event is very soon, so the lineup is likely already finalized."
    };
  }

  return {
    listedArtistCount: 0,
    lineupCompleteness: "unknown",
    supportSlotSignal: "unknown",
    explanation: "No attraction data is available for this event."
  };
}

function monthsUntil(dateStr: string, now: Date): number {
  const target = toDateOnlyString(dateStr);
  const today = toDateOnlyString(now);
  if (!target || !today) {
    return 0;
  }
  const left = new Date(`${today}T00:00:00Z`);
  const right = new Date(`${target}T00:00:00Z`);
  return (right.getFullYear() - left.getFullYear()) * 12 + (right.getMonth() - left.getMonth());
}

function toFiniteNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
