import { cosineSimilarity } from "../../knowledge/cosineSimilarity.js";
import type { EmbeddingProvider } from "../../knowledge/embeddings.js";
import type { OrganizationEntityType } from "../organization.schema.js";
import type { OrganizationChunkStore } from "./organizationChunkStore.js";
import type { OrganizationChunkFilter } from "./types.js";

export const DEFAULT_ORGANIZATION_RETRIEVAL_LIMIT = 12;

export interface RetrievedOrganizationContext {
  chunkId: string;
  organizationId: string;
  organizationName: string;
  opportunityType: OrganizationEntityType;
  sourceUrl: string;
  sourceDomain: string;
  lastVerifiedAt: string;
  confidenceScore: number;
  text: string;
  similarityScore: number;
}

export interface RetrieveOrganizationContextOptions {
  filter?: OrganizationChunkFilter;
  limit?: number;
}

/**
 * Retrieves the top embedded organization chunks for a natural language
 * query. Structured metadata filters (opportunityType, country, city,
 * genres, sourceDomain, lastVerifiedAt, confidenceScore) narrow the
 * candidate pool before vector similarity ranks it, per issue #127's
 * acceptance criteria.
 */
export async function retrieveOrganizationContext(
  query: string,
  chunkStore: OrganizationChunkStore,
  embeddingProvider: EmbeddingProvider,
  options: RetrieveOrganizationContextOptions = {}
): Promise<RetrievedOrganizationContext[]> {
  const limit = options.limit ?? DEFAULT_ORGANIZATION_RETRIEVAL_LIMIT;

  const candidates = await chunkStore.list(options.filter);
  const embeddedCandidates = candidates.filter(
    (chunk): chunk is typeof chunk & { embedding: number[] } => Array.isArray(chunk.embedding)
  );

  if (embeddedCandidates.length === 0) {
    return [];
  }

  const [queryEmbedding] = await embeddingProvider.embed([query]);

  return embeddedCandidates
    .map((chunk) => ({
      chunkId: chunk.id,
      organizationId: chunk.organizationId,
      organizationName: chunk.organizationName,
      opportunityType: chunk.opportunityType,
      sourceUrl: chunk.sourceUrl,
      sourceDomain: chunk.sourceDomain,
      lastVerifiedAt: chunk.lastVerifiedAt,
      confidenceScore: chunk.confidenceScore,
      text: chunk.text,
      similarityScore: cosineSimilarity(queryEmbedding, chunk.embedding)
    }))
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);
}
