import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChunkStore } from "./chunkStore.js";
import { parseKnowledgeChunk, type KnowledgeChunk } from "./knowledgeChunk.schema.js";
import type { KnowledgeChunkFilter } from "./types.js";

export const DEFAULT_CHUNK_STORE_PATH = path.join("outputs", "knowledge", "chunks.json");

export class LocalChunkStore implements ChunkStore {
  constructor(private readonly filePath: string = DEFAULT_CHUNK_STORE_PATH) {}

  async save(chunk: KnowledgeChunk): Promise<KnowledgeChunk> {
    const [saved] = await this.saveMany([chunk]);
    return saved;
  }

  async saveMany(chunks: KnowledgeChunk[]): Promise<KnowledgeChunk[]> {
    const byId = new Map((await this.readAll()).map((chunk) => [chunk.id, chunk]));
    const saved: KnowledgeChunk[] = [];

    for (const input of chunks) {
      const candidate = parseKnowledgeChunk(input);
      byId.set(candidate.id, candidate);
      saved.push(candidate);
    }

    await this.writeAll(Array.from(byId.values()));
    return saved;
  }

  async list(filter: KnowledgeChunkFilter = {}): Promise<KnowledgeChunk[]> {
    const chunks = await this.readAll();
    return chunks.filter((chunk) => matchesFilter(chunk, filter));
  }

  async findByIds(ids: string[]): Promise<KnowledgeChunk[]> {
    const idSet = new Set(ids);
    const chunks = await this.readAll();
    return chunks.filter((chunk) => idSet.has(chunk.id));
  }

  private async readAll(): Promise<KnowledgeChunk[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((entry) => parseKnowledgeChunk(entry));
  }

  private async writeAll(chunks: KnowledgeChunk[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(chunks, null, 2), "utf8");
  }
}

function matchesFilter(chunk: KnowledgeChunk, filter: KnowledgeChunkFilter): boolean {
  if (filter.domain && chunk.domain !== filter.domain) {
    return false;
  }
  if (filter.documentId && chunk.documentId !== filter.documentId) {
    return false;
  }
  return true;
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "ENOENT";
}
