import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalOrganizationChunkStore } from "../../src/sources/rag/localOrganizationChunkStore.js";
import type { OrganizationChunk } from "../../src/sources/rag/organizationChunk.schema.js";

async function createStore(): Promise<LocalOrganizationChunkStore> {
  const dir = await mkdtemp(path.join(tmpdir(), "organization-chunk-store-"));
  return new LocalOrganizationChunkStore(path.join(dir, "organizationChunks.json"));
}

const bookerChunk: OrganizationChunk = {
  id: "org-1-0-abc",
  organizationId: "org-1",
  organizationName: "Le Sonic Booking",
  opportunityType: "BOOKER",
  country: "France",
  city: "Lyon",
  genres: ["metalcore"],
  sourceDomain: "booker.example.com",
  sourceUrl: "https://booker.example.com/about",
  lastVerifiedAt: "2026-07-01T00:00:00.000Z",
  confidenceScore: 0.6,
  text: "Le Sonic Booking represents metalcore acts across France.",
  createdAt: "2026-07-01T00:00:00.000Z"
};

const venueChunk: OrganizationChunk = {
  id: "org-2-0-def",
  organizationId: "org-2",
  organizationName: "Le Klub",
  opportunityType: "VENUE",
  country: "France",
  city: "Paris",
  genres: ["indie"],
  sourceDomain: "leklub.example.com",
  sourceUrl: "https://leklub.example.com",
  lastVerifiedAt: "2026-07-10T00:00:00.000Z",
  confidenceScore: 0.9,
  text: "Le Klub is an indie venue in Paris.",
  createdAt: "2026-07-10T00:00:00.000Z"
};

describe("LocalOrganizationChunkStore", () => {
  it("persists chunks to the local JSON file", async () => {
    const store = await createStore();
    const filePath = (store as unknown as { filePath: string }).filePath;

    await store.save(bookerChunk);

    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(bookerChunk.id);
  });

  it("loads previously saved chunks from disk", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "organization-chunk-store-"));
    const filePath = path.join(dir, "organizationChunks.json");

    const firstStore = new LocalOrganizationChunkStore(filePath);
    await firstStore.save(bookerChunk);

    const secondStore = new LocalOrganizationChunkStore(filePath);
    const loaded = await secondStore.list();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(bookerChunk.id);
  });

  it("upserts a chunk by id, preserving a single entry", async () => {
    const store = await createStore();

    await store.save(bookerChunk);
    await store.save({ ...bookerChunk, embedding: [0.1, 0.2] });

    const all = await store.list();

    expect(all).toHaveLength(1);
    expect(all[0].embedding).toEqual([0.1, 0.2]);
  });

  it("finds chunks by id", async () => {
    const store = await createStore();
    await store.saveMany([bookerChunk, venueChunk]);

    const found = await store.findByIds([bookerChunk.id, "missing-id"]);

    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(bookerChunk.id);
  });

  it("filters by opportunityType, country, city, genre and sourceDomain", async () => {
    const store = await createStore();
    await store.saveMany([bookerChunk, venueChunk]);

    expect(await store.list({ opportunityType: "VENUE" })).toHaveLength(1);
    expect(await store.list({ country: "France" })).toHaveLength(2);
    expect(await store.list({ city: "Paris" })).toHaveLength(1);
    expect(await store.list({ genre: "metalcore" })).toHaveLength(1);
    expect(await store.list({ sourceDomain: "leklub.example.com" })).toHaveLength(1);
  });

  it("filters by minConfidenceScore and verifiedAfter", async () => {
    const store = await createStore();
    await store.saveMany([bookerChunk, venueChunk]);

    expect(await store.list({ minConfidenceScore: 0.8 })).toHaveLength(1);
    expect(await store.list({ verifiedAfter: "2026-07-05T00:00:00.000Z" })).toHaveLength(1);
  });

  it("rejects an invalid chunk instead of persisting it", async () => {
    const store = await createStore();

    await expect(store.save({ ...bookerChunk, sourceUrl: "not-a-url" })).rejects.toThrow();
    expect(await store.list()).toHaveLength(0);
  });
});
