import type { EmbeddingProvider } from "../../knowledge/embeddings.js";
import { warnLog } from "../../utils/logger.js";
import type { OrganizationFilter } from "../organization.schema.js";
import type { OrganizationStore } from "../organizationStore.js";
import { buildOrganizationChunks } from "./buildOrganizationChunks.js";
import { embedOrganizationChunks } from "./embedOrganizationChunks.js";
import type { OrganizationChunkStore } from "./organizationChunkStore.js";

export interface OrganizationRagIngestionOptions {
  organizationStore: OrganizationStore;
  chunkStore: OrganizationChunkStore;
  embeddingProvider: EmbeddingProvider;
  filter?: OrganizationFilter;
}

export interface OrganizationRagIngestionSummary {
  organizationsIndexed: number;
  chunksCreated: number;
  generatedAt: string;
}

/** Indexes every stored organization (issue #124-126 data model) into the organization RAG chunk store (issue #127). */
export async function runOrganizationRagIngestion(
  options: OrganizationRagIngestionOptions
): Promise<OrganizationRagIngestionSummary> {
  const organizations = await options.organizationStore.list(options.filter);

  let chunksCreated = 0;
  for (const organization of organizations) {
    const chunks = buildOrganizationChunks(organization);
    if (chunks.length === 0) {
      continue;
    }
    const saved = await embedOrganizationChunks(chunks, options.chunkStore, options.embeddingProvider);
    chunksCreated += saved.length;
  }

  const summary: OrganizationRagIngestionSummary = {
    organizationsIndexed: organizations.length,
    chunksCreated,
    generatedAt: new Date().toISOString()
  };

  warnLog(
    "sources",
    ["Organization RAG ingestion:", `- organizations indexed: ${summary.organizationsIndexed}`, `- chunks created/updated: ${summary.chunksCreated}`].join(
      "\n"
    )
  );

  return summary;
}
