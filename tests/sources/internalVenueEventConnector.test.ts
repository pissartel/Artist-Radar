import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalDocumentStore } from "../../src/knowledge/localDocumentStore.js";
import { importInternalVenueEventOrganizations } from "../../src/sources/connectors/internalVenueEventConnector.js";

async function createDocumentStore(): Promise<LocalDocumentStore> {
  const dir = await mkdtemp(path.join(tmpdir(), "internal-org-store-"));
  return new LocalDocumentStore(path.join(dir, "documents.json"));
}

describe("importInternalVenueEventOrganizations", () => {
  it("maps internal venue and festival documents into organization source records with a source URL", async () => {
    const documentStore = await createDocumentStore();
    await documentStore.saveMany([
      {
        domain: "booking",
        sourceName: "Le Sonic",
        sourceType: "venue",
        url: "https://le-sonic.example.com",
        text: "Le Sonic is a concert venue in Lyon.",
        city: "Lyon",
        country: "France"
      },
      {
        domain: "booking",
        sourceName: "Rock En Seine",
        sourceType: "festival",
        url: "https://rock-en-seine.example.com",
        text: "Rock En Seine is a festival in Paris.",
        city: "Paris",
        country: "France"
      },
      {
        domain: "booking",
        sourceName: "Some Blog",
        sourceType: "blog",
        url: "https://blog.example.com",
        text: "Not an organization source."
      }
    ]);

    const records = await importInternalVenueEventOrganizations(documentStore);

    expect(records).toHaveLength(2);
    expect(records.find((record) => record.name === "Le Sonic")).toMatchObject({
      sourceType: "internal_venue",
      sourceUrl: "https://le-sonic.example.com",
      organizationType: "VENUE",
      city: "Lyon",
      country: "France",
      contactEmail: null
    });
    expect(records.find((record) => record.name === "Rock En Seine")).toMatchObject({
      sourceType: "internal_event",
      organizationType: "PROMOTER"
    });
  });

  it("returns an empty list when there are no internal documents", async () => {
    const documentStore = await createDocumentStore();
    const records = await importInternalVenueEventOrganizations(documentStore);
    expect(records).toEqual([]);
  });
});
