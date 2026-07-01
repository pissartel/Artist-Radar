import OpenAI from "openai";
import type { ChunkStore } from "./chunkStore.js";
import type { KnowledgeChunk } from "./knowledgeChunk.schema.js";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(
    apiKey = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL
  ) {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required. Add it to .env or export it in your shell.");
    }

    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await this.client.embeddings.create({ model: this.model, input: texts });
    return response.data.map((item) => item.embedding);
  }
}

/**
 * Embeds a set of chunks, reusing cached embeddings for chunks already present in the store
 * (chunk ids are content-derived, so an unchanged chunk always resolves to a cache hit).
 */
export async function embedChunks(
  chunks: KnowledgeChunk[],
  store: ChunkStore,
  provider: EmbeddingProvider
): Promise<KnowledgeChunk[]> {
  if (chunks.length === 0) {
    return [];
  }

  const existing = await store.findByIds(chunks.map((chunk) => chunk.id));
  const cachedById = new Map(existing.filter((chunk) => chunk.embedding).map((chunk) => [chunk.id, chunk]));

  const pending = chunks.filter((chunk) => !cachedById.has(chunk.id));
  const newlyEmbeddedById = new Map<string, KnowledgeChunk>();

  if (pending.length > 0) {
    const vectors = await provider.embed(pending.map((chunk) => chunk.text));
    pending.forEach((chunk, index) => {
      newlyEmbeddedById.set(chunk.id, { ...chunk, embedding: vectors[index] });
    });
  }

  const resolved = chunks.map((chunk) => cachedById.get(chunk.id) ?? newlyEmbeddedById.get(chunk.id) ?? chunk);

  await store.saveMany(resolved);
  return resolved;
}
