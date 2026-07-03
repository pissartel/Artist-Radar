import OpenAI from "openai";
import { runAiPipeline } from "../ai/pipeline/aiPipeline.js";
import type { AiDomainPipelineConfig, AiPipelineInput, AiPromptPayload } from "../ai/pipeline/types.js";
import {
  AiSimilarArtistSchema,
  type AiArtistSizeTier,
  type AiGenreCompatibility,
  type AiGeographicRelevance,
  type AiSimilarArtist,
  type AiSimilarArtistCategory
} from "../ai/schemas/similarArtist.schema.js";
import type { AiEvidence } from "../ai/schemas/evidence.schema.js";
import { validateAiOutputList, type AiValidationListResult } from "../ai/validation/validateAiOutput.js";
import {
  buildSimilarArtistsRagPrompt,
  type SimilarArtistRagContextDocument
} from "../ai/prompts/similar-artists-rag.prompt.js";
import type { ChunkStore } from "../knowledge/chunkStore.js";
import type { EmbeddingProvider } from "../knowledge/embeddings.js";
import { OpenAIEmbeddingProvider } from "../knowledge/embeddings.js";
import { LocalChunkStore } from "../knowledge/localChunkStore.js";
import {
  DEFAULT_RETRIEVAL_LIMIT,
  retrieveRelevantContext,
  type RetrievedContext
} from "../knowledge/retrieveRelevantContext.js";
import { matchBookingGenres, type BookingGenreMatchLevel } from "../booking/genreMatching.js";
import { debugLog } from "../utils/logger.js";
import type { SimilarArtistRagCandidate, SimilarArtistRagSearchInput } from "./types.js";

const MIN_STRONG_CONTEXT_DOCUMENTS = 3;
const GENRE_COMPATIBILITY_RANK: Record<AiGenreCompatibility, number> = { reject: 0, weak: 1, medium: 2, strong: 3 };
const GENRE_COMPATIBILITY_BY_RANK: AiGenreCompatibility[] = ["reject", "weak", "medium", "strong"];

export interface SimilarArtistAiResult {
  name: string;
  genres: string[];
  city: string | null;
  country: string | null;
  url: string | null;
  similarityScore: number;
  sizeTier: AiArtistSizeTier;
  genreCompatibility: AiGenreCompatibility;
  geographicRelevance: AiGeographicRelevance | null;
  category: AiSimilarArtistCategory;
  reason: string;
  evidence: AiEvidence[];
}

export interface SimilarArtistAiSourceUsed {
  sourceName: string;
  sourceType: string;
  url: string;
}

export interface RejectedSimilarArtistCandidate {
  name: string;
  reason: string;
}

export interface SimilarArtistAiWorkflowResult {
  input: SimilarArtistRagSearchInput;
  similarArtists: SimilarArtistAiResult[];
  rejectedCount: number;
  rejectedCandidates: RejectedSimilarArtistCandidate[];
  sourcesUsed: SimilarArtistAiSourceUsed[];
  warnings: string[];
  generatedAt: string;
}

export interface SimilarArtistsAiWorkflowDeps {
  chunkStore?: ChunkStore;
  embeddingProvider?: EmbeddingProvider;
  retrieveRelevantContext?: typeof retrieveRelevantContext;
  callModel?: (prompt: AiPromptPayload) => Promise<string>;
  retrievalLimit?: number;
  openaiClient?: OpenAI;
  model?: string;
}

interface RawSimilarArtistModelOutput {
  content: string;
}

/**
 * Runs the similar-artists domain through the shared AI pipeline, grounding
 * every classification in RAG context retrieved from the knowledge base. A
 * fresh pipeline config is built per call (instead of registered once in the
 * shared domain registry), mirroring the booking RAG workflow, because
 * retrieval results for this run are held in a closure-scoped map.
 */
export async function runSimilarArtistsAiWorkflow(
  searchInput: SimilarArtistRagSearchInput,
  deps: SimilarArtistsAiWorkflowDeps = {}
): Promise<SimilarArtistAiWorkflowResult> {
  const config = createSimilarArtistsAiWorkflowConfig(searchInput, deps);
  const pipelineInput: AiPipelineInput = {
    domain: "similar-artists",
    artistName: searchInput.artist,
    genre: searchInput.genre,
    city: searchInput.city,
    target: searchInput.target ?? undefined,
    links: searchInput.links
  };

  const result = await runAiPipeline(pipelineInput, config);
  return result.result;
}

export function createSimilarArtistsAiWorkflowConfig(
  searchInput: SimilarArtistRagSearchInput,
  deps: SimilarArtistsAiWorkflowDeps = {}
): AiDomainPipelineConfig<
  RawSimilarArtistModelOutput,
  AiValidationListResult<AiSimilarArtist>,
  { similarArtists: SimilarArtistAiResult[]; rejectedCount: number; rejectedCandidates: RejectedSimilarArtistCandidate[]; warnings: string[] },
  SimilarArtistAiWorkflowResult
> {
  const chunkStore = deps.chunkStore ?? new LocalChunkStore();
  const embeddingProvider = deps.embeddingProvider ?? new OpenAIEmbeddingProvider();
  const retrieve = deps.retrieveRelevantContext ?? retrieveRelevantContext;
  const retrievalLimit = deps.retrievalLimit ?? DEFAULT_RETRIEVAL_LIMIT;
  const callModel = deps.callModel ?? buildDefaultCallModel(deps);

  const retrievedByChunkId = new Map<string, RetrievedContext>();
  const candidatesByName = new Map(
    searchInput.candidates.map((candidate) => [normalizeComparableName(candidate.name), candidate])
  );

  return {
    domain: "similar-artists",
    stages: {
      collectSources: async () => {
        const queries = buildSimilarArtistRetrievalQueries(searchInput);
        const merged = new Map<string, RetrievedContext>();

        for (const query of queries) {
          const results = await retrieve(query, chunkStore, embeddingProvider, {
            domain: "similar-artists",
            limit: retrievalLimit
          });
          for (const result of results) {
            const existing = merged.get(result.chunkId);
            if (!existing || result.similarityScore > existing.similarityScore) {
              merged.set(result.chunkId, result);
            }
          }
        }

        const topResults = [...merged.values()]
          .sort((a, b) => b.similarityScore - a.similarityScore)
          .slice(0, retrievalLimit);
        topResults.forEach((result) => retrievedByChunkId.set(result.chunkId, result));

        return topResults.map((result) => ({ id: result.chunkId, sourceUrl: result.url, content: result.text }));
      },

      normalizeDocuments: (documents) =>
        documents.map((document) => ({ id: document.id, sourceUrl: document.sourceUrl, text: document.content.trim() })),

      retrieveContext: (documents) => {
        const notes: string[] = [];
        if (documents.length === 0) {
          notes.push(
            `No RAG context was found for "${searchInput.genre}" around ${searchInput.city}. No similar artists can be returned for this search.`
          );
        } else if (documents.length < MIN_STRONG_CONTEXT_DOCUMENTS) {
          notes.push(
            `Only ${documents.length} context source(s) were found for this search; similar artist classifications are based on limited evidence.`
          );
        }

        return { documents, notes };
      },

      buildPrompt: (context) => {
        const contextDocuments: SimilarArtistRagContextDocument[] = context.documents.map((document) => {
          const retrieved = retrievedByChunkId.get(document.id);
          return {
            ...document,
            sourceName: retrieved?.sourceName ?? "Unknown source",
            sourceType: retrieved?.sourceType ?? "unknown"
          };
        });

        return buildSimilarArtistsRagPrompt({ input: searchInput, contextDocuments });
      },

      callModel: async (prompt) => {
        if (retrievedByChunkId.size === 0 || searchInput.candidates.length === 0) {
          return { content: JSON.stringify({ similarArtists: [] }) };
        }
        return { content: await callModel(prompt) };
      },

      validateOutput: (rawOutput) => {
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(rawOutput.content);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { valid: [], warnings: [`Similar artists RAG model output was not valid JSON: ${message}`] };
        }

        const rawSimilarArtists =
          isRecord(parsedJson) && Array.isArray(parsedJson.similarArtists) ? parsedJson.similarArtists : [];

        return validateAiOutputList(AiSimilarArtistSchema, rawSimilarArtists, { label: "Similar artist" });
      },

      scoreResults: (validatedOutput) => {
        const retrievedUrls = new Set([...retrievedByChunkId.values()].map((result) => result.url));
        const similarArtists: SimilarArtistAiResult[] = [];
        const rejectedCandidates: RejectedSimilarArtistCandidate[] = [];
        const warnings = [...validatedOutput.warnings];
        let rejectedCount = 0;

        for (const candidateResult of validatedOutput.valid) {
          const knownCandidate = candidatesByName.get(normalizeComparableName(candidateResult.name));
          if (!knownCandidate) {
            rejectedCount += 1;
            const reason = `"${candidateResult.name}" rejected: not present in the given candidate list (possible hallucination).`;
            rejectedCandidates.push({ name: candidateResult.name, reason });
            warnings.push(reason);
            continue;
          }

          if (candidateResult.genreCompatibility === "reject") {
            rejectedCount += 1;
            const reason = candidateResult.rejectionReason ?? `"${knownCandidate.name}" rejected: not genre-compatible with ${searchInput.genre}.`;
            rejectedCandidates.push({ name: knownCandidate.name, reason });
            warnings.push(`"${knownCandidate.name}" rejected: ${reason}`);
            continue;
          }

          const groundedEvidence = candidateResult.evidence.filter(
            (evidence) => evidence.sourceUrl === null || retrievedUrls.has(evidence.sourceUrl)
          );

          if (groundedEvidence.length === 0) {
            rejectedCount += 1;
            const reason = `"${knownCandidate.name}" rejected: cited sources are not present in the retrieved context.`;
            rejectedCandidates.push({ name: knownCandidate.name, reason });
            warnings.push(reason);
            continue;
          }

          const evidenceText = groundedEvidence.map((evidence) => `${evidence.source} ${evidence.snippet ?? ""}`).join(" ");
          const evidenceGenreMatch = matchBookingGenres([searchInput.genre], [], evidenceText);
          const resolvedGenreCompatibility = resolveGenreCompatibility(
            candidateResult.genreCompatibility,
            evidenceGenreMatch.level
          );

          if (resolvedGenreCompatibility === "reject") {
            rejectedCount += 1;
            const reason = `"${knownCandidate.name}" rejected: retrieved evidence is not genre-compatible with ${searchInput.genre}.`;
            rejectedCandidates.push({ name: knownCandidate.name, reason });
            warnings.push(reason);
            continue;
          }

          if (resolvedGenreCompatibility !== candidateResult.genreCompatibility) {
            warnings.push(
              `"${knownCandidate.name}": downgraded genre compatibility from "${candidateResult.genreCompatibility}" to "${resolvedGenreCompatibility}" based on retrieved evidence.`
            );
          }

          const penaltyMultiplier = resolvedGenreCompatibility === "weak" ? 0.5 : resolvedGenreCompatibility === "medium" ? 0.85 : 1;
          const similarityScore = clampScore(Math.round((candidateResult.similarityScore ?? 0) * penaltyMultiplier));
          const category = resolvedGenreCompatibility === "weak" && candidateResult.category === "musically_similar"
            ? "scene_adjacent"
            : candidateResult.category;

          similarArtists.push({
            name: knownCandidate.name,
            genres: knownCandidate.genres,
            city: knownCandidate.city,
            country: knownCandidate.country,
            url: knownCandidate.url,
            similarityScore,
            sizeTier: candidateResult.sizeTier ?? "unknown",
            genreCompatibility: resolvedGenreCompatibility,
            geographicRelevance: candidateResult.geographicRelevance,
            category,
            reason: candidateResult.reason,
            evidence: groundedEvidence
          });
        }

        similarArtists.sort((a, b) => b.similarityScore - a.similarityScore);
        debugLog("similar-artists", "similar artists RAG rejected candidates", rejectedCandidates);

        return {
          similarArtists: similarArtists.slice(0, searchInput.limit),
          rejectedCount,
          rejectedCandidates,
          warnings
        };
      },

      formatResult: (scoredOutput, context) => {
        const sourcesUsedByUrl = new Map<string, SimilarArtistAiSourceUsed>();
        for (const artist of scoredOutput.similarArtists) {
          for (const evidence of artist.evidence) {
            if (!evidence.sourceUrl) {
              continue;
            }
            const retrieved = [...retrievedByChunkId.values()].find((result) => result.url === evidence.sourceUrl);
            if (retrieved) {
              sourcesUsedByUrl.set(retrieved.url, {
                sourceName: retrieved.sourceName,
                sourceType: retrieved.sourceType,
                url: retrieved.url
              });
            }
          }
        }

        return {
          input: searchInput,
          similarArtists: scoredOutput.similarArtists,
          rejectedCount: scoredOutput.rejectedCount,
          rejectedCandidates: scoredOutput.rejectedCandidates,
          sourcesUsed: [...sourcesUsedByUrl.values()],
          warnings: [...context.notes, ...scoredOutput.warnings],
          generatedAt: new Date().toISOString()
        };
      }
    }
  };
}

function buildSimilarArtistRetrievalQueries(input: SimilarArtistRagSearchInput): string[] {
  const location = input.target ?? input.city;
  const queries = [
    `${input.artist} ${input.genre} similar artists`,
    `${input.genre} scene ${location}`,
    `${input.genre} playlists lineups ${location}`,
    ...input.candidates.map(
      (candidate) => `${candidate.name} bio genres playlists venues co-bill`
    )
  ];

  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
}

function resolveGenreCompatibility(
  modelClaim: AiGenreCompatibility,
  evidenceLevel: BookingGenreMatchLevel
): AiGenreCompatibility {
  if (evidenceLevel === "incompatible") {
    return "reject";
  }

  const evidenceRank = evidenceLevel === "exact" ? 3 : evidenceLevel === "related" ? 2 : evidenceLevel === "generic" ? 1 : 2;
  const finalRank = Math.min(GENRE_COMPATIBILITY_RANK[modelClaim], evidenceRank);
  return GENRE_COMPATIBILITY_BY_RANK[finalRank];
}

function buildDefaultCallModel(deps: SimilarArtistsAiWorkflowDeps): (prompt: AiPromptPayload) => Promise<string> {
  return async (prompt) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!deps.openaiClient && !apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for the similar artists RAG workflow. Add it to .env, or inject a callModel/openaiClient dependency for testing."
      );
    }

    const client = deps.openaiClient ?? new OpenAI({ apiKey });
    const model = deps.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty response for the similar artists RAG call.");
    }

    return content;
  };
}

function normalizeComparableName(name: string): string {
  return name.trim().toLowerCase();
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(value, 100));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type { SimilarArtistRagCandidate, SimilarArtistRagSearchInput };
