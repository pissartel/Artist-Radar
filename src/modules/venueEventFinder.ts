import {
  EventCandidateSchema,
  VenueCandidateSchema,
  type ArtistProfile,
  type EventCandidate,
  type VenueCandidate
} from "../schemas.js";
import { debugLog } from "../utils/logger.js";

export interface VenueEventFinderInput {
  profile: ArtistProfile;
  target?: string | null;
  genre?: string | null;
  city?: string | null;
  env?: {
    MOCK_AI?: string;
  };
}

export interface EventProvider {
  findEvents(input: VenueEventFinderInput): Promise<EventCandidate[]>;
}

export interface VenueProvider {
  findVenues(input: VenueEventFinderInput): Promise<VenueCandidate[]>;
}

export interface VenueEventCandidates {
  venueCandidates: VenueCandidate[];
  eventCandidates: EventCandidate[];
}

export async function findVenueEventCandidates(input: VenueEventFinderInput): Promise<VenueEventCandidates> {
  const mockMode = input.env?.MOCK_AI?.trim().toLowerCase() === "true" || process.env.MOCK_AI === "true";
  if (!mockMode) {
    debugLog("events", "provider used", { providerUsed: "none" });
    debugLog("events", "venue/event candidate summary", {
      venueCandidates: 0,
      eventCandidates: 0,
      lineupStatusCounts: {},
      confidenceSummary: null
    });
    return { venueCandidates: [], eventCandidates: [] };
  }

  const genre = input.genre ?? input.profile.genres[0] ?? "alternative";
  const venueCandidates = [
    {
      name: "Le Klub",
      city: "Paris",
      country: "France",
      type: "club",
      estimatedCapacityTier: "small",
      genres: [genre, "punk rock", "alternative rock"],
      sourceUrl: null,
      contact: null,
      confidence: 0.78
    },
    {
      name: "Supersonic",
      city: "Paris",
      country: "France",
      type: "club",
      estimatedCapacityTier: "small",
      genres: [genre, "indie rock", "punk rock"],
      sourceUrl: null,
      contact: null,
      confidence: 0.72
    },
    {
      name: "La Boule Noire",
      city: "Paris",
      country: "France",
      type: "venue",
      estimatedCapacityTier: "medium",
      genres: [genre, "rock", "alternative"],
      sourceUrl: null,
      contact: null,
      confidence: 0.68
    },
    {
      name: "Le Ferrailleur",
      city: "Nantes",
      country: "France",
      type: "venue",
      estimatedCapacityTier: "medium",
      genres: [genre, "punk rock", "metal"],
      sourceUrl: null,
      contact: null,
      confidence: 0.64
    }
  ].map((venue) => VenueCandidateSchema.parse(venue));

  const eventCandidates = [
    {
      name: "Paris alternative night",
      date: null,
      venueName: "Le Klub",
      city: "Paris",
      country: "France",
      region: "Ile-de-France",
      lineup: [],
      lineupStatus: "support_not_announced",
      sourceUrl: null,
      ticketUrl: null,
      description: "Mock candidate for a local bill where support slots may be possible; no slot is confirmed.",
      confidence: 0.66
    },
    {
      name: "French punk rock club night",
      date: null,
      venueName: "Le Ferrailleur",
      city: "Nantes",
      country: "France",
      region: "Pays de la Loire",
      lineup: [],
      lineupStatus: "support_not_announced",
      sourceUrl: null,
      ticketUrl: null,
      description: "Mock candidate for regional routing research; support opportunity is unconfirmed.",
      confidence: 0.58
    }
  ].map((event) => EventCandidateSchema.parse(event));

  debugLog("events", "provider used", { providerUsed: "mock" });
  debugLog("events", "venue/event candidate summary", {
    venueCandidates: venueCandidates.length,
    eventCandidates: eventCandidates.length,
    lineupStatusCounts: countLineupStatuses(eventCandidates),
    confidenceSummary: summarizeConfidence([...venueCandidates, ...eventCandidates])
  });

  return { venueCandidates, eventCandidates };
}

function countLineupStatuses(events: EventCandidate[]): Record<string, number> {
  return events.reduce<Record<string, number>>((counts, event) => {
    counts[event.lineupStatus] = (counts[event.lineupStatus] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeConfidence(candidates: Array<EventCandidate | VenueCandidate>): {
  min: number;
  max: number;
  average: number;
} | null {
  if (candidates.length === 0) {
    return null;
  }

  const values = candidates.map((candidate) => candidate.confidence);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    average: Number((total / values.length).toFixed(2))
  };
}
