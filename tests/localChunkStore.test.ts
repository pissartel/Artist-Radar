import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalChunkStore } from "../src/knowledge/localChunkStore.js";
import type { KnowledgeChunk } from "../src/knowledge/knowledgeChunk.schema.js";

const cleanupDirs: string[] = [];

async function createStore(): Promise<LocalChunkStore> {
  const dir = await mkdtemp(path.join(tmpdir(), "knowledge-chunk-store-"));
  cleanupDirs.push(dir);
  return new LocalChunkStore(path.join(dir, "chunks.json"));
}

afterEach(() => {
  cleanupDirs.length = 0;
});

const bookingChunk: KnowledgeChunk = {
  id: "doc-1-0-abc",
  documentId: "doc-1",
  domain: "booking",
  sourceName: "Le Sonic",
  sourceType: "venue",
  url: "https://le-sonic.example.com",
  text: "Le Sonic books metalcore and hardcore acts in Lyon.",
  createdAt: "2026-06-01T10:00:00.000Z"
};

const similarArtistsChunk: KnowledgeChunk = {
  id: "doc-2-0-def",
  documentId: "doc-2",
  domain: "similar-artists",
  sourceName: "Blog Example",
  sourceType: "blog",
  url: "https://blog.example.com/post",
  text: "An article about similar artists in the metalcore scene.",
  createdAt: "2026-06-01T10:00:00.000Z"
};

describe("LocalChunkStore", () => {
  it("persists chunks to the local JSON file", async () => {
    const store = await createStore();
    const filePath = (store as unknown as { filePath: string }).filePath;

    await store.save(bookingChunk);

    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(bookingChunk.id);
  });

  it("loads previously saved chunks from disk", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "knowledge-chunk-store-"));
    cleanupDirs.push(dir);
    const filePath = path.join(dir, "chunks.json");

    const firstStore = new LocalChunkStore(filePath);
    await firstStore.save(bookingChunk);

    const secondStore = new LocalChunkStore(filePath);
    const loaded = await secondStore.list();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(bookingChunk.id);
  });

  it("filters chunks by domain and document id", async () => {
    const store = await createStore();
    await store.save(bookingChunk);
    await store.save(similarArtistsChunk);

    expect(await store.list({ domain: "booking" })).toHaveLength(1);
    expect(await store.list({ documentId: "doc-2" })).toHaveLength(1);
    expect(await store.list()).toHaveLength(2);
  });

  it("finds chunks by id", async () => {
    const store = await createStore();
    await store.save(bookingChunk);
    await store.save(similarArtistsChunk);

    const found = await store.findByIds([bookingChunk.id, "missing-id"]);

    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(bookingChunk.id);
  });

  it("upserts a chunk by id, preserving a single entry", async () => {
    const store = await createStore();

    await store.save(bookingChunk);
    await store.save({ ...bookingChunk, embedding: [0.1, 0.2] });

    const all = await store.list();

    expect(all).toHaveLength(1);
    expect(all[0].embedding).toEqual([0.1, 0.2]);
  });

  it("rejects an invalid chunk instead of persisting it", async () => {
    const store = await createStore();

    await expect(store.save({ ...bookingChunk, url: "not-a-url" })).rejects.toThrow();
    expect(await store.list()).toHaveLength(0);
  });
});
