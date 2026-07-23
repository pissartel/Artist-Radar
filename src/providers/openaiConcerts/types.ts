import { z } from "zod";

// Model-facing schema: every "optional" field is `.nullable()` rather than
// `.optional()` so it round-trips through OpenAI's strict Structured Outputs
// mode, which requires every property to be listed in `required` (no true
// optionals — absence is modeled as null). See OpenAIConcertClient.ts for how
// this is converted to a JSON Schema via z.toJSONSchema().

const ConcertSourceTypeSchema = z.enum([
  "artist_official",
  "venue_official",
  "festival_official",
  "promoter_official",
  "ticketing",
  "cultural_agenda",
  "press",
  "social",
  "other"
]);

const OpenAIConcertSourceSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  sourceType: ConcertSourceTypeSchema
});

const EventTypeSchema = z.enum(["concert", "festival", "showcase", "support_show", "tour_date", "unknown"]);
const EventStatusSchema = z.enum(["past", "upcoming", "cancelled", "postponed", "unknown"]);

export const OpenAIWebConcertSchema = z.object({
  eventName: z.string().nullable(),
  date: z.string(),
  venue: z.object({
    name: z.string(),
    city: z.string().nullable(),
    region: z.string().nullable(),
    country: z.string().nullable(),
    website: z.string().nullable()
  }),
  lineup: z.array(z.string()).nullable(),
  eventType: EventTypeSchema,
  status: EventStatusSchema,
  sources: z.array(OpenAIConcertSourceSchema),
  evidenceSummary: z.string().nullable(),
  modelConfidence: z.number().min(0).max(1)
});

export const OpenAIConcertDiscoveryResultSchema = z.object({
  artist: z.object({
    requestedName: z.string(),
    resolvedName: z.string().nullable(),
    identityConfidence: z.number().min(0).max(1),
    identityNotes: z.string().nullable()
  }),
  pastConcerts: z.array(OpenAIWebConcertSchema),
  upcomingConcerts: z.array(OpenAIWebConcertSchema),
  searchSummary: z.object({
    pastConcertsFound: z.number().int().min(0),
    upcomingConcertsFound: z.number().int().min(0),
    noUpcomingConcertsFoundInCheckedSources: z.boolean(),
    notes: z.string().nullable()
  })
});

export type OpenAIWebConcert = z.infer<typeof OpenAIWebConcertSchema>;
export type OpenAIConcertDiscoveryResult = z.infer<typeof OpenAIConcertDiscoveryResultSchema>;
export type ConcertSourceType = z.infer<typeof ConcertSourceTypeSchema>;

export type ConcertVerificationStatus = "confirmed" | "probable" | "unverified" | "rejected";

export interface ConcertSource {
  provider: "openai_web_search";
  url: string;
  title?: string | null;
  sourceType?: ConcertSourceType;
  retrievedAt: string;
}

/** A concert after date/citation validation and verification classification — the unit that can become a BookingTarget. */
export interface VerifiedConcert {
  artistName: string;
  eventName: string | null;
  date: string;
  status: "past" | "upcoming" | "cancelled" | "postponed" | "unknown";
  venue: {
    name: string;
    city: string | null;
    region: string | null;
    country: string | null;
    website: string | null;
  };
  lineup: string[];
  eventType: OpenAIWebConcert["eventType"];
  sources: ConcertSource[];
  evidenceSummary: string | null;
  verificationStatus: ConcertVerificationStatus;
  rejectionReason?: string;
}

export interface ArtistIdentityAssessment {
  confidence: number;
  exactNameMatch: boolean;
  status: "resolved" | "ambiguous" | "rejected";
  reason: string;
}

export interface OpenAIConcertDiagnostics {
  enabled: boolean;
  selectedArtistCount: number;
  searchesTriggered: number;
  searchesSkipped: number;
  cacheHits: number;
  cacheMisses: number;
  apiCalls: number;
  apiErrors: number;
  malformedResponses: number;
  rawEvents: number;
  confirmedEvents: number;
  probableEvents: number;
  unverifiedEvents: number;
  rejectedEvents: number;
  sourceCount: number;
}

export function createOpenAIConcertDiagnostics(enabled: boolean): OpenAIConcertDiagnostics {
  return {
    enabled,
    selectedArtistCount: 0,
    searchesTriggered: 0,
    searchesSkipped: 0,
    cacheHits: 0,
    cacheMisses: 0,
    apiCalls: 0,
    apiErrors: 0,
    malformedResponses: 0,
    rawEvents: 0,
    confirmedEvents: 0,
    probableEvents: 0,
    unverifiedEvents: 0,
    rejectedEvents: 0,
    sourceCount: 0
  };
}
