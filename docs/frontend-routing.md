# Frontend Routing

The frontend uses the Next.js App Router with two route groups to separate the
public marketing site from the MVP product. Route groups (`(marketing)`,
`(app)`) don't appear in the URL — they only let each area define its own
layout without copying it into every page.

## Route table

| Route | Group | Layout | Purpose |
|---|---|---|---|
| `/` | `(marketing)` | `MarketingNav` + `MarketingFooter`, no sidebar | Public landing page |
| `/app` | — | none (redirect) | MVP entry point, redirects to `/onboarding` |
| `/onboarding` | — | none (full-screen form) | Artist input flow |
| `/analyzing` | — | none (full-screen loader) | AI pipeline loader |
| `/overview` | `(app)` | `MainLayout` (sidebar) | Artist overview dashboard |
| `/similar-artists` | `(app)` | `MainLayout` (sidebar) | Similar artists list |
| `/similar-artists/[id]` | `(app)` | `MainLayout` (sidebar) | Similar artist detail |
| `/booking` | `(app)` | `MainLayout` (sidebar) | Booking opportunities explorer |
| `/opportunities/[id]` | `(app)` | `MainLayout` (sidebar) | Opportunity detail |
| `/settings` | `(app)` | `MainLayout` (sidebar) | Settings placeholder |
| `/dashboard` | — | none (redirect) | Legacy alias, redirects to `/overview` |

`/onboarding` and `/analyzing` intentionally sit outside the `(app)` group:
they are part of the MVP flow but must not show the product sidebar.

## Route constants

`frontend/src/lib/navigation.ts` exports `LANDING_ROUTE` (`/`) and
`MVP_ENTRY_ROUTE` (`/app`) so links back to the marketing site and "Try the
MVP" CTAs don't hardcode paths.

## Navigating between the two areas

- Landing page CTAs ("Try the MVP") link to `MVP_ENTRY_ROUTE` (`/app`), which
  redirects into the onboarding flow.
- The app sidebar (desktop) and mobile header logo link back to
  `LANDING_ROUTE` (`/`).
