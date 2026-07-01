import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentStore } from "./documentStore.js";
import { parseKnowledgeDocument } from "./knowledgeDocument.schema.js";
import type { KnowledgeDocument, KnowledgeDocumentFilter, NewKnowledgeDocument } from "./types.js";

export const DEFAULT_DOCUMENT_STORE_PATH = path.join("outputs", "knowledge", "documents.json");

export class LocalDocumentStore implements DocumentStore {
  constructor(private readonly filePath: string = DEFAULT_DOCUMENT_STORE_PATH) {}

  async save(document: NewKnowledgeDocument): Promise<KnowledgeDocument> {
    const [saved] = await this.saveMany([document]);
    return saved;
  }

  async saveMany(documents: NewKnowledgeDocument[]): Promise<KnowledgeDocument[]> {
    const byUrl = new Map((await this.readAll()).map((document) => [document.url, document]));
    const saved: KnowledgeDocument[] = [];

    for (const input of documents) {
      const candidate = parseKnowledgeDocument({
        ...input,
        id: input.id ?? randomUUID(),
        fetchedAt: input.fetchedAt ?? new Date().toISOString()
      });

      const existing = byUrl.get(candidate.url);
      const finalDocument = existing ? { ...candidate, id: existing.id } : candidate;
      byUrl.set(finalDocument.url, finalDocument);
      saved.push(finalDocument);
    }

    await this.writeAll(Array.from(byUrl.values()));
    return saved;
  }

  async list(filter: KnowledgeDocumentFilter = {}): Promise<KnowledgeDocument[]> {
    const documents = await this.readAll();
    return documents.filter((document) => matchesFilter(document, filter));
  }

  async findByUrl(url: string): Promise<KnowledgeDocument | null> {
    const documents = await this.readAll();
    return documents.find((document) => document.url === url) ?? null;
  }

  private async readAll(): Promise<KnowledgeDocument[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((entry) => parseKnowledgeDocument(entry));
  }

  private async writeAll(documents: KnowledgeDocument[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(documents, null, 2), "utf8");
  }
}

function matchesFilter(document: KnowledgeDocument, filter: KnowledgeDocumentFilter): boolean {
  if (filter.domain && document.domain !== filter.domain) {
    return false;
  }
  if (filter.sourceType && document.sourceType !== filter.sourceType) {
    return false;
  }
  if (filter.city && document.city !== filter.city) {
    return false;
  }
  if (filter.url && document.url !== filter.url) {
    return false;
  }
  if (filter.genre && !(document.genres ?? []).includes(filter.genre)) {
    return false;
  }
  return true;
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "ENOENT";
}
