import OpenAI from "openai";
import { runAiPipeline } from "../ai/pipeline/aiPipeline.js";
import type { AiDomainPipelineConfig, AiPipelineInput, AiPromptPayload } from "../ai/pipeline/types.js";
import { AiBookingOpportunitySchema, type AiBookingOpportunity } from "../ai/schemas/bookingOpportunity.schema.js";
import type { AiEvidence } from "../ai/schemas/evidence.schema.js";
import { validateAiOutputList, type AiValidationListResult } from "../ai/validation/validateAiOutput.js";
import { buildBookingRagPrompt, type BookingRagContextDocument } from "../ai/prompts/booking-rag.prompt.js";
import type { ChunkStore } from "../knowledge/chunkStore.js";
import type { EmbeddingProvider } from "../knowledge/embeddings.js";
import { OpenAIEmbeddingProvider } from "../knowledge/embeddings.js";
import { LocalChunkStore } from "../knowledge/localChunkStore.js";
import {
  DEFAULT_RETRIEVAL_LIMIT,
  retrieveRelevantContext,
  type RetrievedContext
} from "../knowledge/retrieveRelevantContext.js";
import { matchBookingGenres } from "./genreMatching.js";
import type { BookingSearchInput } from "./types.js";

const MIN_STRONG_CONTEXT_DOCUMENTS = 3;

export interface BookingAiOpportunity {
  name: string;
  type: string;
  city: string | null;
  relevanceScore: number;
  genreCompatibility: number;
  reason: string;
  evidence: AiEvidence[];
  contact: string | null;
  risks: string[];
  confidence: "high" | "medium" | "low";
}

export interface BookingAiSourceUsed {
  sourceName: string;
  sourceType: string;
  url: string;
}

export interface BookingAiWorkflowResult {
  input: BookingSearchInput;
  opportunities: BookingAiOpportunity[];
  rejectedCount: number;
  sourcesUsed: BookingAiSourceUsed[];
  warnings: string[];
  generatedAt: string;
}

export interface BookingAiWorkflowDeps {
  chunkStore?: ChunkStore;
  embeddingProvider?: EmbeddingProvider;
  retrieveRelevantContext?: typeof retrieveRelevantContext;
  callModel?: (prompt: AiPromptPayload) => Promise<string>;
  retrievalLimit?: number;
  openaiClient?: OpenAI;
  model?: string;
}

interface RawBookingModelOutput {
  content: string;
}

/**
 * Runs the booking domain through the shared AI pipeline, grounding every
 * opportunity in RAG context retrieved from the knowledge base. A fresh
 * pipeline config is built per call (instead of registered once in the
 * shared domain registry) because retrieval results for this run are held
 * in a closure-scoped map; sharing one config across concurrent runs would
 * leak context between unrelated searches.
 */
export async function runBookingAiWorkflow(
  bookingInput: BookingSearchInput,
  deps: BookingAiWorkflowDeps = {}
): Promise<BookingAiWorkflowResult> {
  const config = createBookingAiWorkflowConfig(bookingInput, deps);
  const pipelineInput: AiPipelineInput = {
    domain: "booking",
    artistName: bookingInput.artist,
    genre: bookingInput.genre,
    city: bookingInput.city,
    target: bookingInput.target ?? undefined,
    links: bookingInput.links
  };

  const result = await runAiPipeline(pipelineInput, config);
  return result.result;
}

export function createBookingAiWorkflowConfig(
  bookingInput: BookingSearchInput,
  deps: BookingAiWorkflowDeps = {}
): AiDomainPipelineConfig<
  RawBookingModelOutput,
  AiValidationListResult<AiBookingOpportunity>,
  { opportunities: BookingAiOpportunity[]; rejectedCount: number; warnings: string[] },
  BookingAiWorkflowResult
> {
  const chunkStore = deps.chunkStore ?? new LocalChunkStore();
  const embeddingProvider = deps.embeddingProvider ?? new OpenAIEmbeddingProvider();
  const retrieve = deps.retrieveRelevantContext ?? retrieveRelevantContext;
  const retrievalLimit = deps.retrievalLimit ?? DEFAULT_RETRIEVAL_LIMIT;
  const callModel = deps.callModel ?? buildDefaultCallModel(deps);

  const retrievedByChunkId = new Map<string, RetrievedContext>();

  return {
    domain: "booking",
    stages: {
      collectSources: async () => {
        const queries = buildBookingRetrievalQueries(bookingInput);
        const merged = new Map<string, RetrievedContext>();

        for (const query of queries) {
          const results = await retrieve(query, chunkStore, embeddingProvider, {
            domain: "booking",
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
            `No RAG context was found for "${bookingInput.genre}" in ${bookingInput.city}${
              bookingInput.target ? ` (target: ${bookingInput.target})` : ""
            }. No booking opportunities can be returned for this search.`
          );
        } else if (documents.length < MIN_STRONG_CONTEXT_DOCUMENTS) {
          notes.push(
            `Only ${documents.length} context source(s) were found for this search; booking opportunities are based on limited evidence.`
          );
        }

        return { documents, notes };
      },

      buildPrompt: (context) => {
        const contextDocuments: BookingRagContextDocument[] = context.documents.map((document) => {
          const retrieved = retrievedByChunkId.get(document.id);
          return {
            ...document,
            sourceName: retrieved?.sourceName ?? "Unknown source",
            sourceType: retrieved?.sourceType ?? "unknown"
          };
        });

        return buildBookingRagPrompt({ input: bookingInput, contextDocuments });
      },

      callModel: async (prompt) => {
        if (retrievedByChunkId.size === 0) {
          return { content: JSON.stringify({ opportunities: [] }) };
        }
        return { content: await callModel(prompt) };
      },

      validateOutput: (rawOutput) => {
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(rawOutput.content);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { valid: [], warnings: [`Booking RAG model output was not valid JSON: ${message}`] };
        }

        const rawOpportunities =
          isRecord(parsedJson) && Array.isArray(parsedJson.opportunities) ? parsedJson.opportunities : [];

        return validateAiOutputList(AiBookingOpportunitySchema, rawOpportunities, { label: "Booking opportunity" });
      },

      scoreResults: (validatedOutput) => {
        const retrievedUrls = new Set([...retrievedByChunkId.values()].map((result) => result.url));
        const opportunities: BookingAiOpportunity[] = [];
        const warnings = [...validatedOutput.warnings];
        let rejectedCount = 0;

        for (const opportunity of validatedOutput.valid) {
          const groundedEvidence = opportunity.evidence.filter(
            (evidence) => evidence.sourceUrl === null || retrievedUrls.has(evidence.sourceUrl)
          );

          if (groundedEvidence.length === 0) {
            rejectedCount += 1;
            warnings.push(`"${opportunity.name}" rejected: cited sources are not present in the retrieved context.`);
            continue;
          }

          const evidenceText = groundedEvidence.map((evidence) => `${evidence.source} ${evidence.snippet ?? ""}`).join(" ");
          const genreMatch = matchBookingGenres(
            [bookingInput.genre],
            [],
            `${opportunity.type} ${opportunity.reason} ${evidenceText}`
          );

          if (genreMatch.level === "incompatible") {
            rejectedCount += 1;
            warnings.push(`"${opportunity.name}" rejected: not genre-compatible with ${bookingInput.genre}.`);
            continue;
          }

          const penaltyMultiplier = genreMatch.level === "generic" ? 0.5 : genreMatch.level === "unknown" ? 0.75 : 1;
          if (penaltyMultiplier < 1) {
            warnings.push(`"${opportunity.name}": generic rock/pop evidence only — weak genre match for ${bookingInput.genre}.`);
          }

          const verifiedContact = verifyContact(opportunity.contact, `${evidenceText} ${opportunity.reason}`);
          if (opportunity.contact && !verifiedContact) {
            warnings.push(`"${opportunity.name}": contact "${opportunity.contact}" not found in retrieved context — cleared to null.`);
          }

          const relevanceScore = clampScore(Math.round(opportunity.relevanceScore * penaltyMultiplier));
          const genreCompatibility = clampScore(Math.round(opportunity.genreCompatibility * penaltyMultiplier));

          opportunities.push({
            name: opportunity.name,
            type: opportunity.type,
            city: opportunity.city,
            relevanceScore,
            genreCompatibility,
            reason: opportunity.reason,
            evidence: groundedEvidence,
            contact: verifiedContact,
            risks: opportunity.risks,
            confidence: confidenceLabel(relevanceScore, penaltyMultiplier)
          });
        }

        opportunities.sort((a, b) => b.relevanceScore - a.relevanceScore);

        return { opportunities: opportunities.slice(0, bookingInput.limit), rejectedCount, warnings };
      },

      formatResult: (scoredOutput, context) => {
        const sourcesUsedByUrl = new Map<string, BookingAiSourceUsed>();
        for (const opportunity of scoredOutput.opportunities) {
          for (const evidence of opportunity.evidence) {
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
          input: bookingInput,
          opportunities: scoredOutput.opportunities,
          rejectedCount: scoredOutput.rejectedCount,
          sourcesUsed: [...sourcesUsedByUrl.values()],
          warnings: [...context.notes, ...scoredOutput.warnings],
          generatedAt: new Date().toISOString()
        };
      }
    }
  };
}

function buildBookingRetrievalQueries(input: BookingSearchInput): string[] {
  const location = input.target ?? input.city;
  const queries = [
    `${input.artist} ${input.genre} booking`,
    `${input.genre} venues ${input.city}`,
    `${input.genre} festivals ${location}`,
    `${input.genre} similar artists live shows ${location}`
  ];

  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
}

function buildDefaultCallModel(deps: BookingAiWorkflowDeps): (prompt: AiPromptPayload) => Promise<string> {
  return async (prompt) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!deps.openaiClient && !apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for the booking RAG workflow. Add it to .env, or inject a callModel/openaiClient dependency for testing."
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
      throw new Error("OpenAI returned an empty response for the booking RAG call.");
    }

    return content;
  };
}

function verifyContact(contact: string | null, evidenceText: string): string | null {
  if (!contact) {
    return null;
  }
  const normalizedContact = contact.trim().toLowerCase();
  const normalizedEvidence = evidenceText.toLowerCase();
  return normalizedEvidence.includes(normalizedContact) ? contact : null;
}

function confidenceLabel(score: number, penaltyMultiplier: number): "high" | "medium" | "low" {
  if (penaltyMultiplier < 1 || score < 40) {
    return "low";
  }
  if (score < 70) {
    return "medium";
  }
  return "high";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(value, 100));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
