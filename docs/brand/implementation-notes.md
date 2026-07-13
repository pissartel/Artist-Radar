# NextStage Brand — Frontend Implementation Notes

Technical implementation plan for adopting the NextStage brand identity
(`design/brand-guidelines.md`, `design/design-system.md`) in `frontend/`.
This document does **not** implement the redesign — it maps the supplied
brand system onto the actual current codebase so implementation can be
scoped and sequenced correctly.

Source materials reviewed: `design/brand-guidelines.md`, `design/design-system.md`,
`design/logo_assets.zip`, `design/NextStage Logo Rework.zip` (Claude Design
export — a design-system documentation page + 4 logo screenshots, not a
landing-page mock), and the live `frontend/` app.

> **Folder structure status:** `docs/brand/`, `design-reference/`, and
> `public/brand/` (top-level, sibling to `frontend/`) now exist and are
> populated with everything real source material supports:
> - `docs/brand/brand-guidelines.md`, `docs/brand/design-system.md` — copies
>   of the `design/` source docs.
> - `public/brand/logo-next-stage.svg`, `-dark.svg`, `-light.svg`,
>   `-mark.svg`, `favicon.svg` — from `design/logo_assets.zip`
>   (`logo-next-stage.svg`/`-dark.svg` both map to `horizontal-lockup-dark.svg`,
>   the primary lockup, since the whole current app is a dark surface;
>   `-light.svg` is `horizontal-lockup-light.svg` for any future light
>   background; `-mark.svg` is `icon-gradient-dark-bg.svg`; `favicon.svg` is
>   `favicon-32.svg`). Remaining variants (monochrome, transparent, per-size
>   PNG favicons) are still only in `design/logo_assets.zip` — not copied
>   into `public/brand/` since nothing in-app uses them yet; pull them in if
>   a concrete use case shows up (e.g. print collateral, light-bg marketing
>   page).
> - `design-reference/landing-page/claude-design-export.html` — the actual
>   Claude Design export we have. **This is a design-system documentation
>   page, not a landing-page mock** — see §11 for why it shouldn't be treated
>   as landing-page source material.
> - `design-reference/current-app-reference/*.png` — the 4 screenshots that
>   shipped in `NextStage Logo Rework.zip`. On inspection these are captures
>   of the **current, unbranded app** (old purple/gray palette, current
>   `Sidebar`/`KpiCard`/`BookingOpportunityCard` markup) taken for logo-
>   placement context — not new design targets. Renamed and filed separately
>   from real design references so they don't get mistaken for one.
>
> **Still missing, not fabricated:** `design-reference/landing-page/landing-desktop.png`,
> `landing-mobile.png`; all of `design-reference/components/` (`buttons.png`,
> `cards.png`, `navigation.png`, `forms.png`); `public/brand/og-image.png`.
> None of these exist in any supplied source file — there is no landing-page
> mock or component-level visual spec anywhere in `design/`, and no OG image
> asset. Fabricating placeholder images for these would misrepresent them as
> real design direction. If a landing page and per-component visuals are
> in scope, they need to be produced (Figma/Claude Design export or
> equivalent) before implementation can proceed on those surfaces — flag to
> whoever owns design before scheduling §5's landing-page work or any
> component restyle that isn't already covered by `design-system.md`.

---

## 1. Current Styling Architecture

- **Tailwind 3.4.1** (`frontend/tailwind.config.ts`), config-file based (no
  `@theme`/CSS-first Tailwind 4 features available).
- All brand color is currently hardcoded as one-off hex values in
  `tailwind.config.ts` → `theme.extend.colors`:
  `background #0a0b10`, `sidebar #0d0e13`, `card #121318`, `card-alt #16171f`,
  `card-hover #1a1c27`, `accent #7c3aed`, `accent-light #a78bfa`,
  `accent-green #10b981`. **None of these match the new brand palette**
  (new accent is `#9333EA`, current is `#7c3aed`; new bg is `#0B0A10`,
  current is `#0a0b10` — close but not identical, will cause silent drift
  if not replaced wholesale).
- `frontend/src/app/globals.css` sets `body { background-color: #0a0b10; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }` — **no CSS custom properties exist anywhere in the project today**, and **no brand font is loaded** (no `next/font`, no Manrope, no JetBrains Mono). This is the single biggest gap: typography in the design system (Manrope 800 headings, JetBrains Mono eyebrows) is entirely unimplemented.
- `theme.extend.boxShadow` defines `card`, `card-hover`, `card-glow` — values don't match `design-system.md §6` (`--shadow-card`, `--shadow-frame`).
- **No design-token layer exists.** Components consume the small custom
  Tailwind color set (`bg-card`, `text-accent-light`, `bg-accent`, …) *and*,
  extensively, raw Tailwind palette utilities not defined in the design
  system at all: 82 uses of `text-gray-*`, 36 of `border-slate-400/10`, plus
  scattered `purple-400/500`, `blue-400/500`, `emerald-400/500`,
  `yellow-400`, `orange-400`, `rose-400`, `fuchsia-400`, `red-400` across
  KPI icons, type badges, and score badges. None of this maps cleanly to the
  new semantic tokens (`--color-success`, `--color-warning`, `--color-info`,
  `--color-accent`) — it will need a real audit + remap, not a find/replace.
- **No shared UI primitives.** There is no `Button`, `Input`, or generic
  `Card` component — every one of the 8 files with a raw `<button>` and every
  card-shaped `<div>` re-declares its own Tailwind class string inline
  (`KPICard.tsx`, `BookingOpportunityCard.tsx`, `SimilarArtistCard.tsx`,
  `FilterButton.tsx`, `PlaceholderPage.tsx`, etc.). This means the design
  system's button/input/card specs (`design-system.md §10–12`) currently have
  no single implementation point to migrate — each usage site must be found
  and updated individually, or (recommended) extracted into shared
  components as part of the migration.
- Tailwind `content` globs (`tailwind.config.ts`) only scan
  `src/{pages,components,app,lib}` — fine as-is, no change needed.

---

## 2. Where Design Tokens Should Live

Recommend a dedicated token stylesheet, imported once, rather than growing
`globals.css` inline:

```
frontend/src/styles/tokens.css   ← new file: all --color-*, --space-*,
                                    --radius-*, --shadow-*, --border-*,
                                    --gradient-* custom properties, scoped
                                    to :root
frontend/src/app/globals.css     ← @import "../styles/tokens.css" at the
                                    top, keep @tailwind directives + global
                                    resets/scrollbar rules after it
```

Rationale: `design-system.md` defines ~40 custom properties across 7
categories. Keeping them in one file separate from resets makes the token
set diffable and gives a single reviewable file when the palette changes
later (e.g. a future light-mode or white-label variant), without touching
`tailwind.config.ts` internals.

Do **not** duplicate literal hex values inside `tailwind.config.ts`. Every
Tailwind color/radius/shadow extension should reference the CSS variable
(`var(--color-accent)`), so `tokens.css` is the single source of truth and
Tailwind utilities and any hand-written CSS stay in sync automatically.

---

## 3. Token → CSS Variable → Tailwind Mapping

`tailwind.config.ts` `theme.extend` should be rebuilt (replacing the current
`background/sidebar/card/accent` block) as:

```ts
colors: {
  bg:               "var(--color-bg)",
  surface:          "var(--color-surface)",
  "surface-raised":  "var(--color-surface-raised)",
  "text-primary":    "var(--color-text-primary)",
  "text-secondary":  "var(--color-text-secondary)",
  "text-tertiary":   "var(--color-text-tertiary)",
  "text-muted":      "var(--color-text-muted)",
  "text-disabled":   "var(--color-text-disabled)",
  "text-inverse":    "var(--color-text-inverse)",
  accent:            "var(--color-accent)",
  "accent-onDark":   "var(--color-accent-onDark)",
  success:           "var(--color-success)",
  "success-text":    "var(--color-success-text)",
  warning:           "var(--color-warning)",
  "warning-text":    "var(--color-warning-text)",
  info:              "var(--color-info)",
  "info-text":       "var(--color-info-text)",
},
backgroundImage: {
  "gradient-brand": "var(--gradient-brand)",
  "gradient-brand-onDark": "var(--gradient-brand-onDark)",
},
borderRadius: {
  sm: "var(--radius-sm)", md: "var(--radius-md)", lg: "var(--radius-lg)",
  xl: "var(--radius-xl)", "2xl": "var(--radius-2xl)", "3xl": "var(--radius-3xl)",
},
boxShadow: {
  card: "var(--shadow-card)", frame: "var(--shadow-frame)",
},
fontFamily: {
  sans: ["var(--font-manrope)", "sans-serif"],
  mono: ["var(--font-jetbrains-mono)", "monospace"],
},
screens: {
  sm: "480px", md: "768px", lg: "1024px", xl: "1440px", "2xl": "1920px",
},
```

**Tint colors** (`--color-accent-tint`, `--color-success-tint`, etc.) are
`rgba()` values, not swappable via Tailwind's `/opacity` modifier syntax on a
named color — expose them as their own Tailwind color entries (e.g.
`accent-tint`) rather than trying to force `bg-accent/14`.

**Breakpoint change is a real risk, not cosmetic** — see §7 and §10.

**Spacing scale**: the design system's 2px-based scale (`--space-1` … `--space-48`)
does not line up with Tailwind's default 4px-based `spacing` scale at most
steps (e.g. `--space-9: 18px` has no Tailwind equivalent). Two options:
(a) leave Tailwind's default spacing scale alone and use arbitrary-value
utilities (`p-[18px]`) at the specific points design calls for, or (b)
override `theme.spacing` wholesale to the 2px scale, which is a larger,
higher-risk change since every existing `p-4`/`gap-2`/etc. across all 25
component files would silently remap to new pixel values. **Recommend (a)**
— keep default Tailwind spacing, use arbitrary values only where the design
system specifies a non-default number, to avoid an invisible full-app
re-layout.

**Font loading**: use `next/font/google` for Manrope (weight 800 for
headings/wordmark, 500/600/700 for body) and JetBrains Mono (500) in
`frontend/src/app/layout.tsx`, exposing them as CSS variables
(`--font-manrope`, `--font-jetbrains-mono`) consumed by the `fontFamily`
mapping above — do not self-host font files unless offline/build
constraints require it.

---

## 4. Existing Shared Components That Must Be Updated

Direct token/color consumers (must change or break visually):

- `src/components/layout/Sidebar.tsx` — hardcoded `bg-sidebar`,
  `text-accent-light`, nav active/hover states; also see §10, no mobile
  nav fallback exists.
- `src/components/layout/MainLayout.tsx` — `bg-background`, mobile header bar.
- `src/components/layout/PlaceholderPage.tsx` — `bg-card`, `shadow-card-glow`.
- `src/components/common/MatchScoreBadge.tsx` + `src/lib/scoreStyles.ts` —
  score-band colors (`emerald-400`/`accent-light`/`yellow-400`) must be
  remapped to `--color-success` / `--color-accent` / `--color-warning` per
  `design-system.md §13`. `scoreStyles.ts` is the single choke point for
  this — good migration leverage point.
- `src/components/dashboard/KPICard.tsx` — per-metric icon `color`/`bg` map
  uses raw Tailwind palette (`purple-400`, `blue-400`, `orange-400`,
  `emerald-400`, `fuchsia-400`, `rose-400`) with no defined mapping in the
  new semantic token set; needs a design decision (either collapse to the
  4 semantic tints or extend tokens with a documented "data viz" palette —
  not specified in `design-system.md`, flag for design before implementing).
- `src/components/dashboard/BookingOpportunityCard.tsx` — `TYPE_COLORS` map
  (venue/festival/concert/opening_slot) partially maps to
  `design-system.md §13` badge examples (Venue→info, Concert→warning,
  Opening Slot→success) but **festival has no defined mapping** in the
  supplied badge spec — needs a design decision, same as above.
- `src/components/onboarding/FormField.tsx` — label/error colors, input
  states must follow `design-system.md §11`.
- All other `components/dashboard/*.tsx` (`ArtistHeader`,
  `ArtistMetricsPanel`, `ArtistRadarStates`, `BookingExplorer`,
  `BookingInsightsPanel`, `BookingTabs`, `FilterButton`, `KpiGrid`,
  `MatchReasonsList`, `OpportunityDetail`, `SimilarArtistCard`,
  `SimilarArtistDetail`, `SimilarArtistsExplorer`, `SimilarArtistsSection`,
  `TopCitiesPanel`, `WarningsBanner`) — each was sampled or grepped and
  confirmed to reference the old token names or raw palette utilities;
  treat the full `components/dashboard/` directory (16 files) as in scope
  for a token-class audit pass, not just the ones detailed above.

Recommend extracting shared `Button`, `Card`, `Badge`, and `Input`
components during this migration (they don't exist today — see §1) so the
button/card/input specs in `design-system.md §10–12` have one implementation
each instead of being re-declared at every call site.

---

## 5. Layouts and Routes Affected

- `src/app/layout.tsx` — root layout: add Manrope/JetBrains Mono via
  `next/font`, update `<html>`/`<body>` classes, add favicon `<link>` tags
  (none exist today — no `metadata.icons` set), verify metadata title/description still read correctly against brand positioning copy.
- `src/components/layout/MainLayout.tsx` + `Sidebar.tsx` — the shared shell
  used by every authenticated route: `dashboard`, `overview`, `booking`,
  `similar-artists` (+ `[id]`), `opportunities/[id]`, `settings`.
  (Confirm which routes actually import `MainLayout` before assuming full
  coverage — not verified route-by-route in this pass.)
- `src/app/onboarding/page.tsx` (257 lines) — standalone flow, not wrapped
  in `MainLayout`; uses `FormField` and its own layout; centered-column
  width should follow `--container-form: 560px`.
- `src/app/analyzing/page.tsx` — pipeline/progress screen; per
  `design-system.md §8`, centered `--container-pipeline: 560px` column.
- **`src/app/page.tsx` is a 5-line redirect straight to `/onboarding` — there
  is no marketing/landing route in the codebase today.** The brief's
  `design-reference/landing-page/landing-desktop.png` and `landing-mobile.png`
  imply a hero/features landing page that doesn't exist yet as a route. This
  is new-page scope, not a restyle, and should be confirmed with product
  before being bundled into a "brand implementation" pass — it's a much
  bigger unit of work than retheming existing screens.
- `src/app/dev-preview-88/` — appears to be a scratch/preview route; confirm
  with the team whether it's still needed before styling it, or exclude it
  from the migration.

---

## 6. Logo Variant per Location

Based on `public/brand/` (now populated, see folder-structure note above) and
`brand-guidelines.md §3–5`:

| Location | Asset (`public/brand/…`) | Notes |
|---|---|---|
| Sidebar (desktop, dark bg) | `logo-next-stage.svg` (= dark lockup) | Sidebar currently renders **text only** (`Artist Radar` as a styled `<span>`), not the logo mark — needs to become an `<Image>`/inline SVG using the lockup, sized to keep the 248px sidebar width workable (lockup min-width is 120px per guidelines, fits). |
| Mobile top bar (`MainLayout` header, dark bg) | `logo-next-stage.svg`, or `logo-next-stage-mark.svg` alone if width is tight | Current mobile header also renders text-only; same gap as sidebar. |
| Browser tab / favicon | `favicon.svg` (= `favicon-32.svg`, heavier stroke) | **Never** the standard icon scaled down, per guidelines §4. Wire via `metadata.icons` in `layout.tsx`. The size-specific 16/64 PNG/SVG variants from `logo_assets.zip` weren't copied into `public/brand/` (only the 32px SVG was, per the requested file list) — pull in `favicon-16`/`favicon-64` too if `metadata.icons` needs a multi-size set. |
| Social/OG image, app icon contexts | *(missing — `og-image.png`)* | Not in any source material — see folder-structure note above. Needs to be produced before it can be wired into `metadata.openGraph`. |
| Any future light-background surface (marketing page on white/`#EEEEF2`) | `logo-next-stage-light.svg` | Only relevant once/if a light-background landing page (§5) is built — nothing in the current app renders on a light background today (whole app is the dark surface palette). |
| Single-color / print / low-contrast fallback | *(not copied — still in `design/logo_assets.zip` as `icon-monochrome-dark/light.svg`)* | No current use case identified in-app; pull in only if a concrete print/export need arises. |
| Transparent-background variants | *(not copied — still in `design/logo_assets.zip` as `horizontal-lockup-transparent-{dark,light}.svg`)* | Use over non-solid/textured surfaces only if one is introduced; not needed for current flat-surface UI. |

Below 32px, gradient versions must not be used (guidelines §2) — the
favicon set already accounts for this with dedicated heavier-stroke assets.

---

## 7. Responsive Implementation Constraints

- **Breakpoint mismatch is the top risk here.** `design-system.md §9`
  specifies custom breakpoints (480 / 768 / 1024 / 1440 / 1920) that differ
  from Tailwind's defaults (640 / 768 / 1024 / 1280 / 1536), which is what
  `tailwind.config.ts` currently uses implicitly (no `screens` override
  exists). `Sidebar.tsx` already uses `md:` (768px) for its
  desktop/mobile split, which happens to line up — but `xl`/`2xl` usages
  elsewhere (if any) would silently shift breakpoint if `screens` is
  overridden. Grep every `sm:`/`md:`/`lg:`/`xl:`/`2xl:` usage across
  `components/` and `app/` **before** changing `screens`, and treat this as
  its own reviewable step, not folded into the token migration commit.
- **No mobile navigation exists today.** `Sidebar` is `hidden md:flex` and
  `MainLayout`'s `md:hidden` mobile header is a static logo/title bar with
  no menu button, drawer, or bottom tab bar — despite
  `design-system.md §16` specifying a bottom tab bar or slide-over drawer
  for `<768px`. This is a functional gap, not just a style one: mobile
  users currently have **no way to navigate between routes** at all. Needs
  to be built, not restyled.
- Tablet rail behavior (`design-system.md §16`, 72px icon-only sidebar,
  768–1023px) also doesn't exist — `Sidebar` only has the two states
  (hidden / full 224px `w-56`, not even the spec'd 248px).
- Sticky bottom CTA on mobile forms/pipeline screens (onboarding, analyzing)
  is not implemented and would need new layout work.
- Minimum 44×44px tap targets — audit `FilterButton`, bookmark icon buttons
  in `BookingOpportunityCard`, and nav items once mobile nav exists.

---

## 8. Accessibility Requirements

- **Focus-visible states**: `design-system.md §15` requires a persistent
  `box-shadow: 0 0 0 3px rgba(147,51,234,0.35)` or `2px solid #C084FC`
  outline on every interactive element. Nothing in the current codebase
  defines a `:focus-visible` style — this needs to be added globally (likely
  a Tailwind `focus-visible:` utility applied consistently, or a base rule
  in `tokens.css`/`globals.css`), not left to browser defaults, since dark
  UIs commonly suppress default focus rings unintentionally via `outline: none`
  resets. Verify no such reset currently exists (none found in `globals.css`
  today) and don't introduce one.
- **Color contrast**: verify `--color-text-tertiary` (`#9997A6`) and
  `--color-text-muted` (`#6E6C7A`) against `--color-bg` (`#0B0A10`) and
  `--color-surface` (`#16151D`) meet WCAG AA (4.5:1 for body text, 3:1 for
  large text/UI). `--color-text-muted` on `--color-bg` is a plausible fail
  and should be spot-checked with a contrast tool before broad use for
  anything but decorative/disabled text.
- **Non-color status differentiation**: badges (success/warning/info/accent)
  rely on color alone (`design-system.md §13`) — for score bands and type
  badges in particular (`MatchScoreBadge`, `TYPE_COLORS`), confirm text
  labels always accompany the color (they currently do — e.g. `"85% "` plus
  optional label, `TYPE_LABELS` text) and keep that pattern as color tokens
  are swapped in.
- **44×44px minimum tap targets** on mobile (design-system.md §16) — see §7.
- **`aria-current="page"`** already correctly used in `Sidebar.tsx` for
  active nav state — preserve this when restyling, don't rely on visual
  state (background/dot color) alone.
- Alt text / accessible names for logo usage: horizontal lockup SVGs should
  carry a text alternative ("NextStage") when used as a linked home/logo
  element, not decorative `alt=""`.

---

## 9. Migration Order

1. **Token + asset infrastructure** (no visual change to ship behind a flag,
   but will change rendered output immediately since there's no toggle
   mechanism in this app — plan as one atomic PR):
   - Create `frontend/src/styles/tokens.css`, import from `globals.css`.
   - Rebuild `tailwind.config.ts` `theme.extend` per §3.
   - Add `next/font` Manrope + JetBrains Mono to `layout.tsx`.
   - Create `frontend/public/brand/` and `frontend/public/`, place the SVG
     set from `design/logo_assets.zip` there (rename per the
     `logo-next-stage*.svg` convention requested), wire favicon via
     `metadata.icons`.
   - Resolve the open design questions in §4 (KPI icon palette, festival
     badge color) *before* this step, since `scoreStyles.ts` and
     `KPICard.tsx`'s icon map are natural single-choke-point migration
     targets and shouldn't be touched twice.
2. **Shared primitives**: extract `Button`, `Card`, `Badge`, `Input`
   components implementing `design-system.md §10–13` once, since none exist
   today (§1). This unblocks every downstream screen migration and avoids
   re-fixing the same button 8+ times.
3. **Shell**: `MainLayout` + `Sidebar` (add real logo, fix token classes),
   including building the missing mobile nav (§7) — this is the most
   visible, highest-blast-radius surface since every authenticated route
   inherits it.
4. **Dashboard components**: `KPICard`, `BookingOpportunityCard`,
   `SimilarArtistCard`, and the rest of `components/dashboard/`, using the
   new shared primitives from step 2 wherever the component is
   button/card/badge-shaped instead of hand-rolling classes again.
5. **Standalone flows**: `onboarding`, `analyzing` (not wrapped in
   `MainLayout`, lower shared-component reuse, can happen in parallel with
   step 4).
6. **Breakpoint change** (§7) as its own isolated PR after a full
   `sm:`/`md:`/`lg:` usage audit, so a regression is easy to bisect to.
7. **New landing page** (§5) — treat as a separate scoping/planning
   exercise, not part of "restyle existing app," since the route doesn't
   exist yet.

---

## 10. Technical Risks

- **Breaking the app is the default outcome of step 1**, since there's no
  feature flag, no Storybook, and no visual regression tooling in this repo
  (`frontend/tests/` only has `artistRadarMapper.test.ts` and
  `noMockData.test.ts` — both data-layer, not visual). Manual pass through
  every route after each phase is the only current safety net.
- **Breakpoint override (§7) risks silently changing layout** at any
  existing `sm:`/`xl:`/`2xl:` usage not yet audited — must grep first.
- **Undefined mappings**: KPI icon accent colors and the "festival" badge
  color are not specified in `design-system.md` — implementing without a
  decision here means guessing at brand intent (KNown project instruction:
  don't invent requirements not present in source docs — this applies to
  design docs too, treat as a blocking question, not a judgment call).
- **No visible landing page today** means the `design-reference/landing-page/`
  assets referenced in the brief describe a page that must be newly built,
  not restyled — likely a larger effort than the rest of this plan combined
  if scoped in the same pass.
- **Spacing scale mismatch (§3)**: overriding Tailwind's default spacing
  scale wholesale would silently re-flow every existing `p-*`/`gap-*`/`m-*`
  usage across 25 component files with no easy diff signal; the arbitrary-
  value approach avoids this but produces less idiomatic Tailwind and should
  be revisited if/when a fuller design-token Tailwind setup (e.g. Tailwind 4
  `@theme`) is adopted.
- **Existing near-duplicate hex values** (`#0a0b10` vs `#0B0A10`,
  `#7c3aed` vs `#9333EA`) are close enough to look intentional at a glance —
  a partial migration that misses some hardcoded hex strings would be a
  hard-to-spot regression. Recommend a final grep for raw hex literals
  (`#[0-9a-fA-F]{6}`) across `components/`/`app/` after migration to confirm
  no hardcoded colors survive outside `tokens.css`.
- **Font swap changes measured layout**: Manrope 800 vs the current system
  font stack will change line lengths/wrapping everywhere (headings, badges,
  nav labels) — expect truncation/overflow bugs in `text-*` + `truncate`
  usages (e.g. `KpiCard`'s `truncate` label, `BookingOpportunityCard`'s
  title truncate) that were tuned against the old font metrics.

---

## 11. Claude Design Export — What Not to Copy Directly

`design/NextStage Logo Rework.zip` contains a Claude-generated **design
system documentation page** (`NextStage Design System.dc.html` + a print
variant + `NextStage Logo.dc.html`), not a landing-page mockup — the
requested `design-reference/landing-page/claude-design-export.html` doesn't
exist as such; the closest analog is this documentation export. Treat it as
a *rendering* of the same tokens already captured in `design/design-system.md`,
not an additional source of truth. Specifically:

- **Do not copy any inline styles, class names, or HTML structure directly**
  from the `.dc.html` files — they're generated by Claude's artifact
  renderer (`doc-page.js`, `support.js` present in the zip) for
  documentation display, not production markup, and will carry
  presentation-tool-specific scaffolding (print stylesheet variant,
  `.thumbnail` metadata) that has no place in the Next.js app.
- **Gradient usage checked out clean in this export** (only 5 occurrences,
  all the exact `linear-gradient(135deg,#4B4DF7,#9333EA,#F43F5E)` brand
  gradient, no `background-clip: text` gradient-text abuse, no
  `backdrop-filter`/glassmorphism found) — but this was verified against
  the documentation export only, not a real landing page, so it doesn't
  clear the *actual* landing page (once built, §5/§9) of the same risks.
  Re-check any future landing-page mock against `brand-guidelines.md §7`'s
  "gradient reserved for logo + primary CTA only, never full-bleed
  background or decorative wash" rule specifically, since that's the most
  common way AI-generated marketing pages drift from a "restrained accent"
  brand system.
- **The 4 embedded screenshots** (`uploads/Screenshot 2026-07-13*.png`) are
  UI captures of the documentation tool itself displaying the logo/design
  system — not additional design references beyond what's already in
  `design/design-system.md` and `design/NextStage Logo-selection*.png`.
  No new visual information to extract from them.
- **Print-specific variant** (`NextStage Design System-print*.dc.html`) is
  irrelevant to a web app and should not inform any implementation decision.
