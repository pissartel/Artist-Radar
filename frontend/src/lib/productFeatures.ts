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

// Issue #142 follow-up: the Chartmetric audience-enrichment preview toggle's
// visibility is NOT computed here. A plain `NEXT_PUBLIC_ENABLE_CHARTMETRIC_TOGGLE
// === "true"` check would let a stray/misconfigured env var show the
// checkbox in production, since this module is bundled into client code and
// has no way to robustly tell production apart from preview/development at
// runtime in the browser. Use `isChartmetricToggleVisible()` from
// `lib/server/chartmetricToggle.ts` instead, from a Server Component, and
// pass the result down as a prop — see that file for the full rationale.

export const productFeatures = {
  // Debug/diagnostic surfaces — developer-facing raw data, hidden from
  // production users.
  rawJson: debugUIEnabled,
  debugWarnings: debugUIEnabled,

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
