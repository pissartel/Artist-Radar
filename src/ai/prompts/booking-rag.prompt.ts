import type { AiNormalizedDocument, AiPromptPayload } from "../pipeline/types.js";
import type { BookingSearchInput } from "../../booking/types.js";

export interface BookingRagContextDocument extends AiNormalizedDocument {
  sourceName: string;
  sourceType: string;
}

export interface BuildBookingRagPromptInput {
  input: BookingSearchInput;
  contextDocuments: BookingRagContextDocument[];
}

/** Bumped whenever the booking RAG system/user prompt content changes. */
export const BOOKING_RAG_PROMPT_VERSION = "booking-rag-v1";

const BOOKING_OUTPUT_SHAPE = {
  opportunities: [
    {
      name: "string",
      type: "venue | festival | promoter | booking_agency | association | collective | springboard | open_call | live_producer | event | bar",
      city: "string|null",
      relevanceScore: "number 0-100",
      genreCompatibility: "number 0-100",
      reason: "string",
      evidence: [
        {
          source: "string (source name as given in the context)",
          sourceUrl: "string|null (must exactly match a URL given in the context)",
          snippet: "string|null (short quote or paraphrase from the context)",
          confidence: "number 0-1"
        }
      ],
      contact: "string|null",
      risks: ["string"]
    }
  ]
};

/**
 * Builds the system/user prompt pair for the booking RAG analysis call. The
 * model receives only retrieved knowledge base context and must ground every
 * opportunity in it, since retrieveRelevantContext() is the sole source of
 * truth passed in `contextDocuments` and nothing outside it can be verified.
 */
export function buildBookingRagPrompt(details: BuildBookingRagPromptInput): AiPromptPayload {
  const { input, contextDocuments } = details;

  const systemPrompt = [
    "You are Artist Radar Booking RAG, a strict source-grounded analyst for live booking opportunities.",
    "Use only the provided context. Do not invent venues, dates, contacts, or URLs.",
    "Every opportunity must include at least one evidence entry taken from the provided context.",
    "Each evidence sourceUrl must exactly match a URL given in the context, or be null.",
    "Reject opportunities that are not genre-compatible with the artist's genre.",
    `For pop punk, strong compatible genres include: pop punk, punk rock, emo pop, easycore, skate punk, melodic punk.`,
    "Generic rock or pop alone is weak evidence and must not be treated as a strong genre match.",
    "If the context does not support any opportunity, return an empty opportunities array instead of guessing.",
    "Return strict JSON only, matching the requested shape exactly."
  ].join("\n");

  const userPrompt = [
    "Artist context:",
    `- Artist: ${input.artist}`,
    `- City: ${input.city}`,
    `- Genre: ${input.genre}`,
    `- Target: ${input.target ?? "not specified"}`,
    `- Links: ${input.links.length > 0 ? input.links.join(", ") : "none provided"}`,
    "",
    "Preference rules:",
    "- Prefer venues with genre-compatible programming.",
    "- Prefer festivals with relevant lineups.",
    "- Prefer recent or future events in the same scene.",
    "- Prefer places where similar artists have played.",
    "- Prefer public contact pages or booking forms.",
    "- Penalize generic rock/pop venues without genre evidence.",
    "- Penalize outdated sources.",
    "- Penalize unsupported or generic contacts.",
    "- Penalize venues that look too large for the artist's likely level.",
    "",
    contextDocuments.length > 0
      ? `Retrieved context (${contextDocuments.length} source${contextDocuments.length === 1 ? "" : "s"}):`
      : "Retrieved context: none. Return an empty opportunities array.",
    ...contextDocuments.flatMap((document, index) => [
      "",
      `[Context ${index + 1}]`,
      `Source name: ${document.sourceName}`,
      `Source type: ${document.sourceType}`,
      `URL: ${document.sourceUrl ?? "unknown"}`,
      `Text: ${document.text}`
    ]),
    "",
    "Return only JSON with this shape:",
    JSON.stringify(BOOKING_OUTPUT_SHAPE, null, 2)
  ].join("\n");

  return { systemPrompt, userPrompt };
}
