import type { OrganizationChunk } from "./organizationChunk.schema.js";
import type { OrganizationChunkFilter } from "./types.js";

export interface OrganizationChunkStore {
  save(chunk: OrganizationChunk): Promise<OrganizationChunk>;
  saveMany(chunks: OrganizationChunk[]): Promise<OrganizationChunk[]>;
  list(filter?: OrganizationChunkFilter): Promise<OrganizationChunk[]>;
  findByIds(ids: string[]): Promise<OrganizationChunk[]>;
}
