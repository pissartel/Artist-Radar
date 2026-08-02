/**
 * Centralized production-readiness feature flags.
 *
 * Single source of truth for which UI surfaces are allowed to render, so
 * individual components never scatter their own ad hoc environment checks.
 *
 * Debug/diagnostic surfaces (raw JSON, technical warning detail) are NOT
 * computed here — a plain `NEXT_PUBLIC_ENABLE_DEBUG_UI === "true"` check
 * would let a stray/misconfigured env var show them in production, since
 * this module is bundled into client code and has no way to robustly tell
 * production apart from preview/development at runtime in the browser (this
 * was a real production leak — issue #201 follow-up). Use
 * `useProductFeatures().debugUIVisible` from
 * `components/providers/ProductFeaturesProvider.tsx` instead, which is
 * seeded server-side (`lib/server/debugUI.ts`) from the root layout. Same
 * rationale as the Chartmetric toggle — see `lib/server/chartmetricToggle.ts`.
 */

export const productFeatures = {
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
