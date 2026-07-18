import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { EmbeddingProvider } from "../../src/knowledge/embeddings.js";
import { LocalOrganizationChunkStore } from "../../src/sources/rag/localOrganizationChunkStore.js";
import { runOrganizationRagIngestion } from "../../src/sources/rag/organizationRagIngestionService.js";
import { LocalOrganizationStore } from "../../src/sources/localOrganizationStore.js";
import type { NewOrganizationSourceRecord } from "../../src/sources/organization.schema.js";

async function createOrganizationStore(): Promise<LocalOrganizationStore> {
  const dir = await mkdtemp(path.join(tmpdir(), "org-rag-ingestion-org-store-"));
  return new LocalOrganizationStore(path.join(dir, "organizations.json"));
}

async function createChunkStore(): Promise<LocalOrganizationChunkStore> {
  const dir = await mkdtemp(path.join(tmpdir(), "org-rag-ingestion-chunk-store-"));
  return new LocalOrganizationChunkStore(path.join(dir, "organizationChunks.json"));
}

function makeFakeProvider(): EmbeddingProvider & { embed: ReturnType<typeof vi.fn> } {
  return {
    embed: vi.fn(async (texts: string[]) => texts.map((text) => [text.length, 1, 0]))
  };
}

const bookerRecord: NewOrganizationSourceRecord = {
  sourceType: "web_discovery",
  sourceName: "Le Sonic Booking website",
  sourceUrl: "https://booker.example.com/about",
  reliabilityScore: 0.6,
  name: "Le Sonic Booking",
  organizationType: "BOOKER",
  city: "Lyon",
  country: "France",
  websiteUrl: "https://booker.example.com",
  contactEmail: "contact@booker.example.com",
  contactFormUrl: null,
  genres: ["metalcore"],
  services: ["booking"],
  territories: ["France"],
  evidence: ["We book metalcore tours across France."]
};

describe("runOrganizationRagIngestion", () => {
  it("indexes every stored organization into embedded, filterable chunks", async () => {
    const organizationStore = await createOrganizationStore();
    const chunkStore = await createChunkStore();
    const embeddingProvider = makeFakeProvider();

    await organizationStore.upsertMany([bookerRecord]);

    const summary = await runOrganizationRagIngestion({ organizationStore, chunkStore, embeddingProvider });

    expect(summary.organizationsIndexed).toBe(1);
    expect(summary.chunksCreated).toBeGreaterThan(0);

    const chunks = await chunkStore.list();
    expect(chunks.length).toBe(summary.chunksCreated);
    expect(chunks[0].embedding).toBeDefined();
    expect(chunks[0].sourceUrl).toBe(bookerRecord.sourceUrl);
    expect(chunks[0].opportunityType).toBe("BOOKER");
  });

  it("reuses cached embeddings when rerun without changes", async () => {
    const organizationStore = await createOrganizationStore();
    const chunkStore = await createChunkStore();
    const embeddingProvider = makeFakeProvider();

    await organizationStore.upsertMany([bookerRecord]);
    await runOrganizationRagIngestion({ organizationStore, chunkStore, embeddingProvider });
    embeddingProvider.embed.mockClear();

    await runOrganizationRagIngestion({ organizationStore, chunkStore, embeddingProvider });

    expect(embeddingProvider.embed).not.toHaveBeenCalled();
  });

  it("respects an organization filter", async () => {
    const organizationStore = await createOrganizationStore();
    const chunkStore = await createChunkStore();
    const embeddingProvider = makeFakeProvider();

    await organizationStore.upsertMany([
      bookerRecord,
      { ...bookerRecord, sourceUrl: "https://venue.example.com", name: "Le Klub", organizationType: "VENUE", city: "Paris" }
    ]);

    const summary = await runOrganizationRagIngestion({
      organizationStore,
      chunkStore,
      embeddingProvider,
      filter: { organizationType: "VENUE" }
    });

    expect(summary.organizationsIndexed).toBe(1);
    const chunks = await chunkStore.list();
    expect(chunks.every((chunk) => chunk.opportunityType === "VENUE")).toBe(true);
  });
});
