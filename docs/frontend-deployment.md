# Frontend Deployment — Vercel

The frontend lives in `frontend/` and is deployed via Vercel. Every PR automatically gets a preview URL.

## Connect the repo to Vercel

1. Go to [vercel.com](https://vercel.com) and create a new project.
2. Import the `artist-radar` GitHub repository.
3. Set the following project settings:

| Setting          | Value           |
|------------------|-----------------|
| Root Directory   | `frontend`      |
| Framework Preset | Next.js         |
| Install Command  | `npm install`   |
| Build Command    | `npm run build` |
| Output Directory | _(leave default)_ |

4. Deploy. Vercel will detect Next.js automatically.

## Preview deployments

Once connected, every pull request that touches `frontend/` receives a unique preview URL posted as a GitHub check. No local setup is needed to review UI changes.

## Local development

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

## Build verification

```bash
cd frontend
npm run build
```

The build must pass before merging. CI will surface failures as a failed check on the PR.

## Supabase OAuth

Google and Apple buttons are hidden by default. Enable a button only after the
matching provider is enabled under **Supabase Authentication → Providers** and
its provider credentials are present:

```env
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true
NEXT_PUBLIC_AUTH_APPLE_ENABLED=true
```

The provider identifiers used by the frontend are `google` and `apple`. In
**Authentication → URL Configuration**, set the production NextStage origin as
the Site URL and add the callback for every environment to the redirect allow
list:

- `http://localhost:3000/auth/callback`
- `https://<production-nextstage-domain>/auth/callback`
- the Vercel preview callback pattern for this project, for example
  `https://*-<vercel-team-or-account>.vercel.app/auth/callback`

Use the actual production domain and Vercel team/account slug. Keep a provider's
feature flag `false` until its credentials and all relevant callbacks have been
verified. Login and signup share this configuration and callback route.
