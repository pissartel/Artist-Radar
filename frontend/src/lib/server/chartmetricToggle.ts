// Server-only: whether the Chartmetric onboarding toggle may be shown for
// this request (issue #142 follow-up: the checkbox must never render in
// production, even if NEXT_PUBLIC_ENABLE_CHARTMETRIC_TOGGLE is accidentally
// left "true" there).
//
// Reuses the exact same production/preview/development detection the
// backend feature-flag resolver uses
// (src/features/artist-enrichment/chartmetric/chartmetric.feature-flag.ts's
// resolveChartmetricEnvironment, via the compiled dist output — see
// backendPipeline.ts for why this package imports dist/*.js instead of the
// TypeScript source) so the frontend and backend can never disagree about
// which environment a deployment is running in.
//
// Must only be called from a Server Component or route handler and passed
// down as a prop. Reading process.env.VERCEL_ENV/NODE_ENV directly inside a
// "use client" module would resolve to `undefined` once the code runs in
// the browser (only NEXT_PUBLIC_* vars are statically inlined into the
// client bundle), silently falling back to "development" — the unsafe
// direction — and could also produce a server/client hydration mismatch.
import * as chartmetricFeatureFlagRuntime from "../../../../dist/features/artist-enrichment/chartmetric/chartmetric.feature-flag.js";

type ChartmetricEnvironment = "production" | "preview" | "development";
type ResolveChartmetricEnvironmentFn = (env: {
  VERCEL_ENV?: string;
  NODE_ENV?: string;
}) => ChartmetricEnvironment;

const resolveChartmetricEnvironment =
  chartmetricFeatureFlagRuntime.resolveChartmetricEnvironment as ResolveChartmetricEnvironmentFn;

export function isChartmetricToggleVisible(): boolean {
  const environment = resolveChartmetricEnvironment({
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  });
  if (environment === "production") {
    return false;
  }
  return process.env.NEXT_PUBLIC_ENABLE_CHARTMETRIC_TOGGLE === "true";
}

export function isPreviewDataToggleVisible(): boolean {
  return resolveChartmetricEnvironment({
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  }) !== "production";
}
