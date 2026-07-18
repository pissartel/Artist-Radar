import "dotenv/config";
import { OpenAIEmbeddingProvider } from "../src/knowledge/embeddings.js";
import { LocalOrganizationStore } from "../src/sources/localOrganizationStore.js";
import { LocalOrganizationChunkStore } from "../src/sources/rag/localOrganizationChunkStore.js";
import { runOrganizationRagIngestion } from "../src/sources/rag/organizationRagIngestionService.js";

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required to generate embeddings for organization RAG indexing.");
    process.exitCode = 1;
    return;
  }

  const summary = await runOrganizationRagIngestion({
    organizationStore: new LocalOrganizationStore(),
    chunkStore: new LocalOrganizationChunkStore(),
    embeddingProvider: new OpenAIEmbeddingProvider()
  });

  console.log(
    `Organization RAG indexing complete: ${summary.organizationsIndexed} organization(s), ${summary.chunksCreated} chunk(s).`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Organization RAG indexing failed: ${message}`);
  process.exitCode = 1;
});
