import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalOrganizationStore } from "../../src/sources/localOrganizationStore.js";
import type { NewOrganizationSourceRecord } from "../../src/sources/organization.schema.js";

async function createStore(): Promise<LocalOrganizationStore> {
  const dir = await mkdtemp(path.join(tmpdir(), "organization-store-"));
  return new LocalOrganizationStore(path.join(dir, "organizations.json"));
}

const musicBrainzRecord: NewOrganizationSourceRecord = {
  sourceType: "musicbrainz",
  sourceName: "MusicBrainz",
  sourceUrl: "https://musicbrainz.org/label/abc-123",
  reliabilityScore: 0.75,
  name: "Because Music",
  organizationType: "LABEL",
  city: "Paris",
  country: "France",
  websiteUrl: null,
  contactEmail: null,
  contactFormUrl: null
};

const wikidataRecord: NewOrganizationSourceRecord = {
  sourceType: "wikidata",
  sourceName: "Wikidata",
  sourceUrl: "https://www.wikidata.org/wiki/Q1758864",
  reliabilityScore: 0.7,
  name: "Because Music",
  organizationType: "LABEL",
  city: "Paris",
  country: "France",
  websiteUrl: "https://because.tm",
  contactEmail: null,
  contactFormUrl: null
};

describe("LocalOrganizationStore", () => {
  it("imports a label from a single structured source with a source URL", async () => {
    const store = await createStore();

    const [imported] = await store.upsertMany([musicBrainzRecord]);

    expect(imported?.organizationType).toBe("LABEL");
    expect(imported?.sources[0]?.sourceUrl).toBe(musicBrainzRecord.sourceUrl);
  });

  it("merges duplicate organizations discovered from multiple sources", async () => {
    const store = await createStore();

    await store.upsertMany([musicBrainzRecord]);
    const [merged] = await store.upsertMany([wikidataRecord]);

    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(merged?.sources).toHaveLength(2);
  });

  it("preserves conflicting information from each source with attribution", async () => {
    const store = await createStore();
    await store.upsertMany([musicBrainzRecord]);
    const [merged] = await store.upsertMany([wikidataRecord]);

    const websiteUrls = merged?.sources.map((source) => source.websiteUrl);
    expect(websiteUrls).toContain(null);
    expect(websiteUrls).toContain("https://because.tm");
    // Canonical field picks the highest-reliability non-null value.
    expect(merged?.websiteUrl).toBe("https://because.tm");
  });

  it("can be rerun without duplicating existing records", async () => {
    const store = await createStore();

    await store.upsertMany([musicBrainzRecord]);
    await store.upsertMany([musicBrainzRecord]);
    await store.upsertMany([musicBrainzRecord]);

    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.sources).toHaveLength(1);
  });

  it("persists organizations to the local JSON file", async () => {
    const store = await createStore();
    const filePath = (store as unknown as { filePath: string }).filePath;

    await store.upsertMany([musicBrainzRecord]);

    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it("filters organizations by type, city and country", async () => {
    const store = await createStore();
    await store.upsertMany([
      musicBrainzRecord,
      {
        ...musicBrainzRecord,
        sourceUrl: "https://musicbrainz.org/label/other-venue",
        name: "Le Klub",
        organizationType: "VENUE",
        city: "Lyon"
      }
    ]);

    expect(await store.list({ organizationType: "VENUE" })).toHaveLength(1);
    expect(await store.list({ city: "Paris" })).toHaveLength(1);
    expect(await store.list({ country: "France" })).toHaveLength(2);
  });

  it("finds an organization by its dedupe key", async () => {
    const store = await createStore();
    await store.upsertMany([musicBrainzRecord]);

    const found = await store.findByDedupeKey("Because Music", "Paris", "France");
    const notFound = await store.findByDedupeKey("Unknown Label", "Nowhere", "Nowhere");

    expect(found?.name).toBe("Because Music");
    expect(notFound).toBeNull();
  });

  it("rejects an organization source record without a source URL", async () => {
    const store = await createStore();

    await expect(
      store.upsertMany([{ ...musicBrainzRecord, sourceUrl: "not-a-url" }])
    ).rejects.toThrow();
  });
});
