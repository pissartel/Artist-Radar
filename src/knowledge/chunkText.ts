import { createHash } from "node:crypto";
import type { KnowledgeChunk } from "./knowledgeChunk.schema.js";
import type { KnowledgeDocument } from "./knowledgeDocument.schema.js";

export const DEFAULT_CHUNK_SIZE = 220;
export const DEFAULT_CHUNK_OVERLAP = 40;

export interface ChunkTextOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

/** Splits text into overlapping word-based chunks so each chunk fits comfortably in an embedding/prompt window. */
export function chunkText(text: string, options: ChunkTextOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  if (chunkSize <= 0) {
    throw new Error("chunkSize must be greater than 0.");
  }
  if (chunkOverlap < 0 || chunkOverlap >= chunkSize) {
    throw new Error("chunkOverlap must be >= 0 and smaller than chunkSize.");
  }

  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  const step = chunkSize - chunkOverlap;

  for (let start = 0; start < words.length; start += step) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) {
      break;
    }
  }

  return chunks;
}

/** Deterministic chunk id derived from the document id, chunk position, and chunk content. */
export function buildChunkId(documentId: string, chunkIndex: number, text: string): string {
  const contentHash = createHash("sha256").update(text).digest("hex").slice(0, 16);
  return `${documentId}-${chunkIndex}-${contentHash}`;
}

/** Splits a knowledge document into chunk records ready for embedding, carrying source metadata over from the document. */
export function buildKnowledgeChunks(document: KnowledgeDocument, options: ChunkTextOptions = {}): KnowledgeChunk[] {
  const texts = chunkText(document.text, options);
  const createdAt = new Date().toISOString();

  return texts.map((text, index) => ({
    id: buildChunkId(document.id, index, text),
    documentId: document.id,
    domain: document.domain,
    sourceName: document.sourceName,
    sourceType: document.sourceType,
    url: document.url,
    text,
    createdAt
  }));
}
