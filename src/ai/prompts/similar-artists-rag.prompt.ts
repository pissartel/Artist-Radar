import type { AiNormalizedDocument, AiPromptPayload } from "../pipeline/types.js";
import type { SimilarArtistRagSearchInput } from "../../similar-artists/types.js";

export interface SimilarArtistRagContextDocument extends AiNormalizedDocument {
  sourceName: string;
  sourceType: string;
}

export interface BuildSimilarArtistsRagPromptInput {
  input: SimilarArtistRagSearchInput;
  contextDocuments: SimilarArtistRagContextDocument[];
}

/** Bumped whenever the similar artists RAG system/user prompt content changes. */
export const SIMILAR_ARTISTS_RAG_PROMPT_VERSION = "similar-artists-rag-v1";

const SIMILAR_ARTIST_OUTPUT_SHAPE = {
  similarArtists: [
    {
      name: "string (must exactly match one of the candidate names given below)",
      genres: ["string"],
      city: "string|null",
      country: "string|null",
      similarityScore: "number 0-100, or null if rejected",
      sizeTier: "small | medium | large | unknown, or null if rejected",
      genreCompatibility: "strong | medium | weak | reject",
      geographicRelevance: "local | regional | national | international | unknown, or null if rejected",
      category: "musically_similar | scene_adjacent | commercially_useful | large_reference | rejected",
      reason: "string",
      evidence: [
        {
          source: "string (source name as given in the context)",
          sourceUrl: "string|null (must exactly match a URL given in the context)",
          snippet: "string|null (short quote or paraphrase from the context)",
          confidence: "number 0-1"
        }
      ],
      rejectionReason: "string|null (required when genreCompatibility is reject or category is rejected)"
    }
  ]
};

/**
 * Builds the system/user prompt pair for the similar-artists RAG analysis
 * call. The model only classifies the candidates it is given — it must not
 * invent new artist names or metadata — and must ground every accepted
 * classification in the retrieved knowledge base context, since that is the
 * only evidence available for bios, genres, playlists, lineups, venues and
 * co-bills.
 */
export function buildSimilarArtistsRagPrompt(details: BuildSimilarArtistsRagPromptInput): AiPromptPayload {
  const { input, contextDocuments } = details;

  const systemPrompt = [
    "You are Artist Radar Similar Artists RAG, a strict source-grounded analyst for finding comparable artists for booking and promotion.",
    "You are given a fixed list of candidate artists. Classify every candidate given to you. Do not invent, add, or drop candidates.",
    "Use only the provided context and the candidate metadata given to you. Do not invent bios, genres, cities, venues, or URLs.",
    "Every non-rejected candidate must include at least one evidence entry taken from the provided context.",
    "Each evidence sourceUrl must exactly match a URL given in the context, or be null.",
    "",
    "Classify each candidate with:",
    "- genreCompatibility: \"strong\" (same or closely related genre, e.g. pop punk/punk rock/emo pop/easycore/skate punk/melodic punk for a pop punk artist), \"medium\" (adjacent genre with some evidence of scene overlap), \"weak\" (only generic/broad genre evidence, e.g. generic pop or rock), or \"reject\" (unrelated or incompatible genre, e.g. chanson for a pop punk artist).",
    "- sizeTier: \"small\", \"medium\", \"large\", or \"unknown\" if the context does not have enough evidence.",
    "- geographicRelevance: \"local\" (same city/scene), \"regional\" (same country/region), \"national\", \"international\", or \"unknown\".",
    "- category, exactly one of:",
    "  - \"musically_similar\": strong genre match and a comparable, accessible size.",
    "  - \"scene_adjacent\": same local/regional scene or co-bill history, even if the genre match is only medium.",
    "  - \"commercially_useful\": bigger reach than the artist but still genre-compatible enough to be useful for promotion.",
    "  - \"large_reference\": clearly too large to be an active booking target, but useful as a reference point.",
    "  - \"rejected\": genreCompatibility is \"reject\", or there is no usable evidence.",
    "",
    "Reject candidates that are not genre-compatible with the artist's genre, or generic pop/rock/chanson acts with no specific scene evidence.",
    "When genreCompatibility is \"reject\" or category is \"rejected\", set rejectionReason to a short explanation, and similarityScore/sizeTier/geographicRelevance may be null.",
    "If the context does not support classifying a candidate at all, reject it rather than guessing.",
    "Return strict JSON only, matching the requested shape exactly, with exactly one entry per candidate given below."
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
    "- Prefer artists in the same or closely related genre family over generic genre matches.",
    "- Prefer artists in the same local or regional scene.",
    "- Prefer artists at a comparable or accessible size for booking/promo research.",
    "- Large or mainstream artists can still be useful as a reference, but must be labeled large_reference, not musically_similar.",
    "- Penalize generic pop, generic rock, or unrelated chanson candidates without specific genre evidence.",
    "",
    `Candidates to classify (${input.candidates.length}):`,
    ...input.candidates.flatMap((candidate, index) => [
      "",
      `[Candidate ${index + 1}]`,
      `Name: ${candidate.name}`,
      `Known genres: ${candidate.genres.length > 0 ? candidate.genres.join(", ") : "unknown"}`,
      `Known city: ${candidate.city ?? "unknown"}`,
      `Known country: ${candidate.country ?? "unknown"}`,
      `Known URL: ${candidate.url ?? "unknown"}`
    ]),
    "",
    contextDocuments.length > 0
      ? `Retrieved context (${contextDocuments.length} source${contextDocuments.length === 1 ? "" : "s"}):`
      : "Retrieved context: none. Reject every candidate for lack of evidence.",
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
    JSON.stringify(SIMILAR_ARTIST_OUTPUT_SHAPE, null, 2)
  ].join("\n");

  return { systemPrompt, userPrompt };
}
