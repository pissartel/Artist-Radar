import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAiRunMetadata, AI_PIPELINE_VERSION } from "../src/ai/metadata/aiRunMetadata.js";
import { isAiDebugModeEnabled, writeAiDebugReport } from "../src/ai/debug/writeAiDebugReport.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("isAiDebugModeEnabled", () => {
  it("is disabled unless AI_DEBUG_MODE is exactly \"true\"", () => {
    expect(isAiDebugModeEnabled({})).toBe(false);
    expect(isAiDebugModeEnabled({ AI_DEBUG_MODE: "false" })).toBe(false);
    expect(isAiDebugModeEnabled({ AI_DEBUG_MODE: "true" })).toBe(true);
  });
});

describe("writeAiDebugReport", () => {
  it("does not write a file when debug mode is disabled", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-debug-report-"));

    const metadata = createAiRunMetadata({
      domain: "booking",
      model: "gpt-4.1-mini",
      promptVersion: "booking-rag-v1",
      pipelineVersion: AI_PIPELINE_VERSION,
      sourcesUsed: [],
      warnings: []
    });

    const written = await writeAiDebugReport(
      { metadata, retrievedSources: [], validationWarnings: [] },
      { artistName: "Tuesday Fall", outputDir: tempDir },
      {}
    );

    expect(written).toBeNull();
    await expect(readdir(tempDir)).resolves.toEqual([]);
  });

  it("writes retrieved sources, warnings and the prompt to outputs/debug when debug mode is enabled", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-debug-report-"));

    const metadata = createAiRunMetadata({
      domain: "booking",
      model: "gpt-4.1-mini",
      promptVersion: "booking-rag-v1",
      pipelineVersion: AI_PIPELINE_VERSION,
      retrievalQuery: "pop punk venues Lyon",
      retrievedChunkCount: 1,
      sourcesUsed: ["https://le-sonic.example.com/programming"],
      warnings: ["Only 1 context source(s) were found for this search."]
    });

    const filePath = await writeAiDebugReport(
      {
        metadata,
        retrievedSources: [{ sourceName: "Le Sonic", sourceType: "venue", url: "https://le-sonic.example.com/programming" }],
        validationWarnings: ["Only 1 context source(s) were found for this search."],
        prompt: { systemPrompt: "You are Artist Radar Booking RAG.", userPrompt: "Artist context..." }
      },
      { artistName: "Tuesday Fall", outputDir: tempDir },
      { AI_DEBUG_MODE: "true" }
    );

    expect(filePath).not.toBeNull();
    const contents = JSON.parse(await readFile(filePath as string, "utf-8"));

    expect(contents.metadata).toMatchObject({ domain: "booking", model: "gpt-4.1-mini" });
    expect(contents.retrievedSources).toEqual([
      { sourceName: "Le Sonic", sourceType: "venue", url: "https://le-sonic.example.com/programming" }
    ]);
    expect(contents.validationWarnings).toEqual(["Only 1 context source(s) were found for this search."]);
    expect(contents.prompt.systemPrompt).toContain("Booking RAG");
    expect(JSON.stringify(contents)).not.toMatch(/sk-[a-zA-Z0-9]/);
  });
});
