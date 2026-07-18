import type { EmbeddingProvider } from "../../knowledge/embeddings.js";
import type { OrganizationChunk } from "./organizationChunk.schema.js";
import type { OrganizationChunkStore } from "./organizationChunkStore.js";

/**
 * Embeds a set of organization chunks, reusing cached embeddings for chunks
 * already present in the store (chunk ids are content-derived, so an
 * unchanged chunk always resolves to a cache hit).
 */
export async function embedOrganizationChunks(
  chunks: OrganizationChunk[],
  store: OrganizationChunkStore,
  provider: EmbeddingProvider
): Promise<OrganizationChunk[]> {
  if (chunks.length === 0) {
    return [];
  }

  const existing = await store.findByIds(chunks.map((chunk) => chunk.id));
  const cachedById = new Map(existing.filter((chunk) => chunk.embedding).map((chunk) => [chunk.id, chunk]));

  const pending = chunks.filter((chunk) => !cachedById.has(chunk.id));
  const newlyEmbeddedById = new Map<string, OrganizationChunk>();

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
