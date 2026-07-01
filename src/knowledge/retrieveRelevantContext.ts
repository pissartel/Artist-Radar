import type { ChunkStore } from "./chunkStore.js";
import { cosineSimilarity } from "./cosineSimilarity.js";
import type { EmbeddingProvider } from "./embeddings.js";
import type { KnowledgeDomain, KnowledgeSourceType } from "./knowledgeDocument.schema.js";

export const DEFAULT_RETRIEVAL_LIMIT = 12;

export interface RetrievedContext {
  chunkId: string;
  documentId: string;
  sourceName: string;
  sourceType: KnowledgeSourceType;
  url: string;
  text: string;
  similarityScore: number;
}

export interface RetrieveRelevantContextOptions {
  domain?: KnowledgeDomain;
  limit?: number;
}

/** Retrieves the top embedded chunks for a natural language query, ranked by cosine similarity and optionally scoped to a domain. */
export async function retrieveRelevantContext(
  query: string,
  chunkStore: ChunkStore,
  embeddingProvider: EmbeddingProvider,
  options: RetrieveRelevantContextOptions = {}
): Promise<RetrievedContext[]> {
  const limit = options.limit ?? Number(process.env.RAG_RETRIEVAL_LIMIT ?? DEFAULT_RETRIEVAL_LIMIT);

  const chunks = await chunkStore.list(options.domain ? { domain: options.domain } : undefined);
  const embeddedChunks = chunks.filter(
    (chunk): chunk is typeof chunk & { embedding: number[] } => Array.isArray(chunk.embedding)
  );

  if (embeddedChunks.length === 0) {
    return [];
  }

  const [queryEmbedding] = await embeddingProvider.embed([query]);

  return embeddedChunks
    .map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      sourceName: chunk.sourceName,
      sourceType: chunk.sourceType,
      url: chunk.url,
      text: chunk.text,
      similarityScore: cosineSimilarity(queryEmbedding, chunk.embedding)
    }))
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);
}
