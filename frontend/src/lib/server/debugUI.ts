// Server-only: whether developer-facing debug UI (the "Heads Up (Debug)"
// warnings panel, the "Raw JSON" tab) may render for this request.
//
// Mirrors lib/server/chartmetricToggle.ts's rationale exactly, for the same
// underlying bug class: `NEXT_PUBLIC_ENABLE_DEBUG_UI` alone is not a safe
// production check, because it's just as easy to accidentally leave that
// var set to "true" in a Production environment's config (e.g. copied over
// from Preview) as it is for the Chartmetric toggle var. Reuses the same
// production/preview/development detection the backend feature-flag
// resolver uses (via the compiled dist output) so the frontend can never
// disagree with the backend about which environment a deployment is
// running in.
//
// Must only be called from a Server Component or route handler and passed
// down as a prop/context value — see components/providers/ProductFeaturesProvider.tsx.
import * as chartmetricFeatureFlagRuntime from "../../../../dist/features/artist-enrichment/chartmetric/chartmetric.feature-flag.js";

type DeploymentEnvironment = "production" | "preview" | "development";
type ResolveDeploymentEnvironmentFn = (env: {
  VERCEL_ENV?: string;
  NODE_ENV?: string;
}) => DeploymentEnvironment;

// Generically named here even though it's exported from a Chartmetric-named
// backend module — the logic (VERCEL_ENV, falling back to NODE_ENV) is not
// Chartmetric-specific, and duplicating it would risk the two copies
// drifting out of sync.
const resolveDeploymentEnvironment =
  chartmetricFeatureFlagRuntime.resolveChartmetricEnvironment as ResolveDeploymentEnvironmentFn;

export function isDebugUIVisible(): boolean {
  const environment = resolveDeploymentEnvironment({
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  });
  if (environment === "production") {
    return false;
  }
  return process.env.NEXT_PUBLIC_ENABLE_DEBUG_UI === "true";
}
