import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import slugify from "slugify";
import type { AiPromptPayload } from "../pipeline/types.js";
import type { AiRunMetadata } from "../metadata/aiRunMetadata.js";

const DEFAULT_DEBUG_OUTPUT_DIR = path.join("outputs", "debug");

export interface AiDebugReportSource {
  sourceName: string;
  sourceType: string;
  url: string;
}

/**
 * Full debug detail for one AI run. Unlike AiRunMetadata (which is safe for
 * normal outputs), this may include the raw system/user prompt sent to the
 * model — it must only ever be written when AI_DEBUG_MODE is enabled.
 */
export interface AiDebugReport {
  metadata: AiRunMetadata;
  retrievedSources: AiDebugReportSource[];
  validationWarnings: string[];
  scoringSummary?: Record<string, unknown>;
  prompt?: AiPromptPayload;
}

export interface WriteAiDebugReportOptions {
  artistName: string;
  outputDir?: string;
}

/** Reads the AI_DEBUG_MODE env flag. Debug reports are off by default to keep normal runs free of local file writes. */
export function isAiDebugModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.AI_DEBUG_MODE ?? "").trim().toLowerCase() === "true";
}

/**
 * Writes a local-only JSON debug report for an AI run to outputs/debug/ when
 * AI_DEBUG_MODE=true. Returns the written file path, or null when debug mode
 * is disabled. Never called from the frontend; for local inspection only.
 */
export async function writeAiDebugReport(
  report: AiDebugReport,
  options: WriteAiDebugReportOptions,
  env: NodeJS.ProcessEnv = process.env
): Promise<string | null> {
  if (!isAiDebugModeEnabled(env)) {
    return null;
  }

  const outputDir = options.outputDir ?? DEFAULT_DEBUG_OUTPUT_DIR;
  await mkdir(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = slugify(`${report.metadata.domain}-${options.artistName}`, { lower: true, strict: true });
  const filePath = path.join(outputDir, `${slug}-${timestamp}.json`);

  await writeFile(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filePath;
}
