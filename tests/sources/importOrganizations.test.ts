import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runOrganizationImport } from "../../src/sources/importOrganizations.js";
import { LocalOrganizationStore } from "../../src/sources/localOrganizationStore.js";
import type { TrustedOrganizationSeed } from "../../src/sources/config/trustedOrganizations.js";

function responseWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function createStore(): Promise<LocalOrganizationStore> {
  const dir = await mkdtemp(path.join(tmpdir(), "import-organizations-"));
  return new LocalOrganizationStore(path.join(dir, "organizations.json"));
}

const trustedSeed: TrustedOrganizationSeed = {
  name: "Example Music Industry Association",
  organizationType: "ASSOCIATION",
  sourceUrl: "https://example-association.org/about"
};

describe("runOrganizationImport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("imports labels from MusicBrainz and merges them with trusted directory organizations", async () => {
    const store = await createStore();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ labels: [{ id: "label-1", name: "Because Music" }] }))
      .mockResolvedValueOnce(responseWithJson({ id: "label-1", name: "Because Music", relations: [] }));

    const summary = await runOrganizationImport({
      store,
      musicBrainzLabelQueries: ["Because Music"],
      trustedOrganizationSeeds: [trustedSeed],
      fetchImpl
    });

    expect(summary.organizationsImported).toBe(2);
    expect(summary.sourceRecordsFetched).toBe(2);
    expect(summary.warnings).toEqual([]);
  });

  it("records a warning and continues importing other sources when a connector throws", async () => {
    const store = await createStore();
    const failingDocumentStore = {
      list: vi.fn().mockRejectedValue(new Error("document store unavailable")),
      save: vi.fn(),
      saveMany: vi.fn(),
      findByUrl: vi.fn()
    };

    const summary = await runOrganizationImport({
      store,
      documentStore: failingDocumentStore,
      trustedOrganizationSeeds: [trustedSeed]
    });

    expect(summary.organizationsImported).toBe(1);
    expect(summary.warnings).toHaveLength(1);
    expect(summary.warnings[0]).toContain("Internal venue/event import failed");
  });

  it("can be rerun without duplicating imported organizations", async () => {
    const store = await createStore();

    await runOrganizationImport({ store, trustedOrganizationSeeds: [trustedSeed] });
    const summary = await runOrganizationImport({ store, trustedOrganizationSeeds: [trustedSeed] });

    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(summary.organizationsImported).toBe(1);
  });
});
