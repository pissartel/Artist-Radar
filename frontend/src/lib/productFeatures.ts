/**
 * Centralized production-readiness feature flags.
 *
 * Single source of truth for which UI surfaces are allowed to render, so
 * individual components never scatter their own ad hoc environment checks.
 *
 * Debug/diagnostic surfaces (raw JSON, technical warning detail) are gated
 * behind an explicit opt-in env var rather than `NODE_ENV`, since preview
 * deployments run in a production-like build but may still want debug
 * access for internal testing. Default (unset) is always the safe,
 * production behavior: debug UI hidden.
 *
 * To enable locally: set `NEXT_PUBLIC_ENABLE_DEBUG_UI=true` in
 * `frontend/.env.local`. To enable on a preview deployment, set the same
 * variable in that environment's config. Never set it in production.
 */
const debugUIEnabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_UI === "true";

// Issue #142: the Chartmetric audience-enrichment preview toggle must only
// ever be shown in preview/development, never to standard production
// users — same "explicit opt-in env var, safe-hidden default" shape as
// debugUIEnabled above, kept as its own flag since a environment may want
// debug UI without Chartmetric (or vice versa).
const chartmetricToggleEnabled = process.env.NEXT_PUBLIC_ENABLE_CHARTMETRIC_TOGGLE === "true";

export const productFeatures = {
  // Debug/diagnostic surfaces — developer-facing raw data, hidden from
  // production users.
  rawJson: debugUIEnabled,
  debugWarnings: debugUIEnabled,

  // Preview/development-only toggle letting a tester opt this one request
  // into Chartmetric audience enrichment (issue #142). Never set this env
  // var in production.
  chartmetricToggle: chartmetricToggleEnabled,

  // Product surfaces that exist in the codebase but aren't finished —
  // hidden regardless of debug mode until they have real functionality.
  settings: false,

  // Opportunity categories beyond the current live/booking MVP scope. Not
  // implemented yet; listed here so the roadmap stays visible in code
  // rather than only in docs. See docs/brand and the landing page's
  // "more categories are coming" section for the product-facing framing.
  playlists: false,
  labels: false,
  professionalContacts: false,
} as const;
