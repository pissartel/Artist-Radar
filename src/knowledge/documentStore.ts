import type { KnowledgeDocument, KnowledgeDocumentFilter, NewKnowledgeDocument } from "./types.js";

export interface DocumentStore {
  save(document: NewKnowledgeDocument): Promise<KnowledgeDocument>;
  saveMany(documents: NewKnowledgeDocument[]): Promise<KnowledgeDocument[]>;
  list(filter?: KnowledgeDocumentFilter): Promise<KnowledgeDocument[]>;
  findByUrl(url: string): Promise<KnowledgeDocument | null>;
}
