import type { ChunkStore } from "../knowledge/chunkStore.js";
import type { EmbeddingProvider } from "../knowledge/embeddings.js";
import type { KnowledgeChunk } from "../knowledge/knowledgeChunk.schema.js";
import type { KnowledgeChunkFilter } from "../knowledge/types.js";

/**
 * Shared plumbing + grading checks for golden AI evals (issue #49). Eval
 * test files describe fixture-driven cases and lean on this module instead
 * of re-implementing in-memory RAG stubs or hand-rolling pass/fail output.
 */

export type EvalGenreCompatibilityLevel = "strong" | "medium" | "weak" | "reject";

const GENRE_COMPATIBILITY_RANK: Record<EvalGenreCompatibilityLevel, number> = {
  reject: 0,
  weak: 1,
  medium: 2,
  strong: 3
};

export interface EvalEvidenceLike {
  source: string;
  sourceUrl: string | null;
  snippet?: string | null;
}

export interface EvalContextDocument {
  sourceName: string;
  sourceType: string;
  url: string;
  text: string;
  createdAt?: string;
}

/** Minimal in-memory ChunkStore so eval fixtures can ground mocked model output without live retrieval/embeddings. */
export class InMemoryEvalChunkStore implements ChunkStore {
  constructor(private readonly chunks: KnowledgeChunk[]) {}

  async save(chunk: KnowledgeChunk): Promise<KnowledgeChunk> {
    this.chunks.push(chunk);
    return chunk;
  }

  async saveMany(chunks: KnowledgeChunk[]): Promise<KnowledgeChunk[]> {
    this.chunks.push(...chunks);
    return chunks;
  }

  async list(filter: KnowledgeChunkFilter = {}): Promise<KnowledgeChunk[]> {
    return this.chunks.filter((chunk) => {
      if (filter.domain && chunk.domain !== filter.domain) return false;
      if (filter.documentId && chunk.documentId !== filter.documentId) return false;
      return true;
    });
  }

  async findByIds(ids: string[]): Promise<KnowledgeChunk[]> {
    const idSet = new Set(ids);
    return this.chunks.filter((chunk) => idSet.has(chunk.id));
  }
}

export function buildEvalChunkStore(
  domain: KnowledgeChunk["domain"],
  documents: EvalContextDocument[]
): ChunkStore {
  const chunks: KnowledgeChunk[] = documents.map((document, index) => ({
    id: `eval-chunk-${index}-${document.url}`,
    documentId: `eval-doc-${index}-${document.url}`,
    domain,
    sourceName: document.sourceName,
    sourceType: document.sourceType as KnowledgeChunk["sourceType"],
    url: document.url,
    text: document.text,
    createdAt: document.createdAt ?? new Date().toISOString(),
    embedding: [1, 0]
  }));

  return new InMemoryEvalChunkStore(chunks);
}

/** Every eval fixture chunk uses the same fake embedding; retrieval is grounded by fixture data, not real similarity search. */
export function buildEvalEmbeddingProvider(): EmbeddingProvider {
  return { embed: async (texts: string[]) => texts.map(() => [1, 0]) };
}

export interface EvalCheckResult {
  check: string;
  passed: boolean;
  message: string;
}

export interface EvalCaseReport {
  caseName: string;
  checks: EvalCheckResult[];
}

function result(check: string, passed: boolean, message: string): EvalCheckResult {
  return { check, passed, message };
}

export function isValidHttpUrl(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Acceptance criteria: booking/similar-artist evals check for evidence presence. */
export function checkHasEvidence(evidence: EvalEvidenceLike[]): EvalCheckResult {
  const passed = evidence.length > 0;
  return result(
    "evidence-presence",
    passed,
    passed ? `Has ${evidence.length} evidence entr${evidence.length === 1 ? "y" : "ies"}.` : "No evidence entries found."
  );
}

/** Acceptance criteria: automated check for valid URLs. */
export function checkHasValidSourceUrls(evidence: EvalEvidenceLike[]): EvalCheckResult {
  const urls = evidence.map((item) => item.sourceUrl).filter((url): url is string => url !== null);
  const invalid = urls.filter((url) => !isValidHttpUrl(url));
  const passed = urls.length > 0 && invalid.length === 0;
  return result(
    "valid-source-url",
    passed,
    passed
      ? `All ${urls.length} source URL(s) are valid http(s) URLs.`
      : invalid.length > 0
        ? `Invalid source URL(s): ${invalid.join(", ")}.`
        : "No source URL present."
  );
}

/** Acceptance criteria: no invented contacts — a contact must be traceable to cited evidence text. */
export function checkNoInventedContact(contact: string | null, evidence: EvalEvidenceLike[]): EvalCheckResult {
  if (!contact) {
    return result("no-invented-contact", true, "No contact was returned (safe default).");
  }
  const evidenceText = evidence
    .map((item) => item.snippet ?? "")
    .join(" ")
    .toLowerCase();
  const passed = evidenceText.includes(contact.trim().toLowerCase());
  return result(
    "no-invented-contact",
    passed,
    passed ? `Contact "${contact}" is grounded in cited evidence.` : `Contact "${contact}" is not found in any cited evidence — likely invented.`
  );
}

/** Acceptance criteria: genre compatibility must clear a minimum bar (e.g. reject weak/reject at the top of results). */
export function checkGenreCompatibilityAtLeast(
  level: EvalGenreCompatibilityLevel,
  minimum: EvalGenreCompatibilityLevel
): EvalCheckResult {
  const passed = GENRE_COMPATIBILITY_RANK[level] >= GENRE_COMPATIBILITY_RANK[minimum];
  return result(
    "genre-compatibility",
    passed,
    passed ? `Genre compatibility "${level}" meets the minimum "${minimum}".` : `Genre compatibility "${level}" is below the minimum "${minimum}".`
  );
}

/** Acceptance criteria: no rejected genres in top results. */
export function checkNoRejectedGenreInTopResults(levels: EvalGenreCompatibilityLevel[]): EvalCheckResult {
  const rejected = levels.filter((level) => level === "reject");
  const passed = rejected.length === 0;
  return result(
    "no-rejected-genre-in-top-results",
    passed,
    passed ? "No rejected-genre items in top results." : `${rejected.length} rejected-genre item(s) leaked into top results.`
  );
}

/** Acceptance criteria: no unsupported opportunities — a known-bad candidate name must not appear in the accepted list. */
export function checkNotAccepted(acceptedNames: string[], candidateName: string): EvalCheckResult {
  const normalized = acceptedNames.map((name) => name.trim().toLowerCase());
  const passed = !normalized.includes(candidateName.trim().toLowerCase());
  return result(
    "no-unsupported-opportunity",
    passed,
    passed ? `"${candidateName}" was correctly rejected.` : `"${candidateName}" was unexpectedly accepted despite being an unsupported/bad case.`
  );
}

/** Acceptance criteria: a known-good candidate name must appear in the accepted list. */
export function checkAccepted(acceptedNames: string[], candidateName: string): EvalCheckResult {
  const normalized = acceptedNames.map((name) => name.trim().toLowerCase());
  const passed = normalized.includes(candidateName.trim().toLowerCase());
  return result(
    "expected-accepted",
    passed,
    passed ? `"${candidateName}" was correctly accepted.` : `"${candidateName}" was unexpectedly rejected/missing.`
  );
}

export function reportPassed(report: EvalCaseReport): boolean {
  return report.checks.every((check) => check.passed);
}

/** Acceptance criteria: eval output clearly shows pass/fail reasons in CLI/test output. */
export function printEvalSummary(evalName: string, reports: EvalCaseReport[]): void {
  const totalChecks = reports.reduce((sum, report) => sum + report.checks.length, 0);
  const failedChecks = reports.reduce((sum, report) => sum + report.checks.filter((check) => !check.passed).length, 0);

  console.log(`\n=== Eval summary: ${evalName} ===`);
  for (const report of reports) {
    const status = reportPassed(report) ? "PASS" : "FAIL";
    console.log(`[${status}] ${report.caseName}`);
    for (const check of report.checks) {
      console.log(`  - ${check.passed ? "ok " : "FAIL"} ${check.check}: ${check.message}`);
    }
  }
  console.log(`--- ${totalChecks - failedChecks}/${totalChecks} checks passed ---\n`);
}
