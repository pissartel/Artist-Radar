import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDocumentStore } from "../src/knowledge/localDocumentStore.js";
import type { NewKnowledgeDocument } from "../src/knowledge/types.js";

const cleanupDirs: string[] = [];

async function createStore(): Promise<LocalDocumentStore> {
  const dir = await mkdtemp(path.join(tmpdir(), "knowledge-store-"));
  cleanupDirs.push(dir);
  return new LocalDocumentStore(path.join(dir, "documents.json"));
}

afterEach(() => {
  cleanupDirs.length = 0;
});

const venueDocument: NewKnowledgeDocument = {
  domain: "booking",
  sourceName: "Le Sonic",
  sourceType: "venue",
  url: "https://le-sonic.example.com",
  title: "Le Sonic venue page",
  text: "Le Sonic is a concert venue in Lyon booking metalcore and hardcore acts.",
  city: "Lyon",
  country: "France",
  genres: ["metalcore", "hardcore"]
};

const festivalDocument: NewKnowledgeDocument = {
  domain: "booking",
  sourceName: "Rock En Seine",
  sourceType: "festival",
  url: "https://rock-en-seine.example.com",
  text: "Rock En Seine is a festival in Paris featuring rock and metal artists.",
  city: "Paris",
  country: "France",
  genres: ["rock", "metal"]
};

describe("LocalDocumentStore", () => {
  it("creates a document with a generated id and fetchedAt", async () => {
    const store = await createStore();

    const saved = await store.save(venueDocument);

    expect(saved.id).toBeTruthy();
    expect(saved.fetchedAt).toBeTruthy();
    expect(saved.sourceName).toBe("Le Sonic");
  });

  it("persists documents to the local JSON file", async () => {
    const store = await createStore();
    const filePath = (store as unknown as { filePath: string }).filePath;

    await store.save(venueDocument);

    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].url).toBe(venueDocument.url);
  });

  it("loads previously saved documents from disk", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "knowledge-store-"));
    cleanupDirs.push(dir);
    const filePath = path.join(dir, "documents.json");

    const firstStore = new LocalDocumentStore(filePath);
    await firstStore.save(venueDocument);

    const secondStore = new LocalDocumentStore(filePath);
    const loaded = await secondStore.list();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].sourceName).toBe("Le Sonic");
  });

  it("filters documents by domain, source type, genre, and city", async () => {
    const store = await createStore();
    await store.save(venueDocument);
    await store.save(festivalDocument);

    expect(await store.list({ sourceType: "festival" })).toHaveLength(1);
    expect(await store.list({ city: "Lyon" })).toHaveLength(1);
    expect(await store.list({ genre: "rock" })).toHaveLength(1);
    expect(await store.list({ domain: "booking" })).toHaveLength(2);
  });

  it("retrieves a document by url", async () => {
    const store = await createStore();
    await store.save(venueDocument);

    const found = await store.findByUrl(venueDocument.url);
    const notFound = await store.findByUrl("https://missing.example.com");

    expect(found?.sourceName).toBe("Le Sonic");
    expect(notFound).toBeNull();
  });

  it("prevents duplicate documents by url by updating the existing entry", async () => {
    const store = await createStore();

    const first = await store.save(venueDocument);
    const second = await store.save({ ...venueDocument, title: "Updated title" });

    const all = await store.list();

    expect(all).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(all[0].title).toBe("Updated title");
  });

  it("rejects an invalid document instead of persisting it", async () => {
    const store = await createStore();

    await expect(
      store.save({
        ...venueDocument,
        url: "not-a-url"
      })
    ).rejects.toThrow();

    expect(await store.list()).toHaveLength(0);
  });
});
