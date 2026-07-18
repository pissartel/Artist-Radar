import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseOrganizationChunk, type OrganizationChunk } from "./organizationChunk.schema.js";
import type { OrganizationChunkStore } from "./organizationChunkStore.js";
import type { OrganizationChunkFilter } from "./types.js";

export const DEFAULT_ORGANIZATION_CHUNK_STORE_PATH = path.join("outputs", "sources", "organizationChunks.json");

export class LocalOrganizationChunkStore implements OrganizationChunkStore {
  constructor(private readonly filePath: string = DEFAULT_ORGANIZATION_CHUNK_STORE_PATH) {}

  async save(chunk: OrganizationChunk): Promise<OrganizationChunk> {
    const [saved] = await this.saveMany([chunk]);
    return saved;
  }

  async saveMany(chunks: OrganizationChunk[]): Promise<OrganizationChunk[]> {
    const byId = new Map((await this.readAll()).map((chunk) => [chunk.id, chunk]));
    const saved: OrganizationChunk[] = [];

    for (const input of chunks) {
      const candidate = parseOrganizationChunk(input);
      byId.set(candidate.id, candidate);
      saved.push(candidate);
    }

    await this.writeAll(Array.from(byId.values()));
    return saved;
  }

  async list(filter: OrganizationChunkFilter = {}): Promise<OrganizationChunk[]> {
    const chunks = await this.readAll();
    return chunks.filter((chunk) => matchesFilter(chunk, filter));
  }

  async findByIds(ids: string[]): Promise<OrganizationChunk[]> {
    const idSet = new Set(ids);
    const chunks = await this.readAll();
    return chunks.filter((chunk) => idSet.has(chunk.id));
  }

  private async readAll(): Promise<OrganizationChunk[]> {
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

    return parsed.map((entry) => parseOrganizationChunk(entry));
  }

  private async writeAll(chunks: OrganizationChunk[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(chunks, null, 2), "utf8");
  }
}

function matchesFilter(chunk: OrganizationChunk, filter: OrganizationChunkFilter): boolean {
  if (filter.organizationId && chunk.organizationId !== filter.organizationId) {
    return false;
  }
  if (filter.opportunityType && chunk.opportunityType !== filter.opportunityType) {
    return false;
  }
  if (filter.country && chunk.country !== filter.country) {
    return false;
  }
  if (filter.city && chunk.city !== filter.city) {
    return false;
  }
  if (filter.genre && !chunk.genres.includes(filter.genre)) {
    return false;
  }
  if (filter.sourceDomain && chunk.sourceDomain !== filter.sourceDomain) {
    return false;
  }
  if (filter.verifiedAfter && chunk.lastVerifiedAt < filter.verifiedAfter) {
    return false;
  }
  if (filter.minConfidenceScore !== undefined && chunk.confidenceScore < filter.minConfidenceScore) {
    return false;
  }
  return true;
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "ENOENT";
}
