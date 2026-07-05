import path from "node:path";
import { config as loadEnv } from "dotenv";
// Turbopack cannot resolve the backend's NodeNext-style ".js" specifiers
// against sibling ".ts" files, so we import the compiled output instead
// (built via `npm run build` at the repo root, wired up as a `predev`/
// `prebuild` hook in package.json). Types come from backendTypes.ts rather
// than the backend source — see the comment there for why.
import * as pipelineRuntime from "../../../../dist/pipeline.js";
import * as schemasRuntime from "../../../../dist/schemas.js";
import * as loggerRuntime from "../../../../dist/utils/logger.js";
import type { BackendArtistInput, BackendPipelineResult } from "./backendTypes";

// The backend pipeline reads its API keys from the repo root .env, one level
// above the Next.js app that `npm run dev` is started from.
loadEnv({ path: path.resolve(process.cwd(), "..", ".env") });

type RunOpportunitySearchFn = (input: BackendArtistInput) => Promise<BackendPipelineResult>;
type ArtistInputParseFn = (raw: unknown) => BackendArtistInput;
type WarnLogFn = (scope: string, message: string, data?: unknown) => void;

export const runOpportunitySearch = pipelineRuntime.runOpportunitySearch as RunOpportunitySearchFn;
export const ArtistInputSchema = {
  parse: schemasRuntime.ArtistInputSchema.parse as ArtistInputParseFn,
};
export const warnLog = loggerRuntime.warnLog as WarnLogFn;
