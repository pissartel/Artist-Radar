export type { KnowledgeDocument, KnowledgeDomain, KnowledgeSourceType } from "./knowledgeDocument.schema.js";
import type { KnowledgeDocument, KnowledgeDomain, KnowledgeSourceType } from "./knowledgeDocument.schema.js";

export type NewKnowledgeDocument = Omit<KnowledgeDocument, "id" | "fetchedAt"> & {
  id?: string;
  fetchedAt?: string;
};

export interface KnowledgeDocumentFilter {
  domain?: KnowledgeDomain;
  sourceType?: KnowledgeSourceType;
  genre?: string;
  city?: string;
  url?: string;
}
