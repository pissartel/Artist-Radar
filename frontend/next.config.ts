import type { NextConfig } from "next";
import path from "path";

const monorepoRoot = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  turbopack: {
    root: monorepoRoot,
  },
  // The API route imports the compiled backend from outside this directory
  // (frontend/src/lib/server/backendPipeline.ts -> ../../../../dist/*.js at
  // the monorepo root) and backendPipeline.ts also reads the monorepo root
  // .env at request time. Without this, Next's output file tracing (the
  // step that decides which files ship in the deployed serverless function
  // on Vercel) defaults its root to this `frontend/` directory and may not
  // correctly include files that live outside it. Mirrors `turbopack.root`
  // above for the separate tracing/output-bundling step.
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
