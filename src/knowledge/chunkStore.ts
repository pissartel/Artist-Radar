import type { KnowledgeChunk } from "./knowledgeChunk.schema.js";
import type { KnowledgeChunkFilter } from "./types.js";

export interface ChunkStore {
  save(chunk: KnowledgeChunk): Promise<KnowledgeChunk>;
  saveMany(chunks: KnowledgeChunk[]): Promise<KnowledgeChunk[]>;
  list(filter?: KnowledgeChunkFilter): Promise<KnowledgeChunk[]>;
  findByIds(ids: string[]): Promise<KnowledgeChunk[]>;
}
