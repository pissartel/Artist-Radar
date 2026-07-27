# French SMAC venue discovery (issue #198)

## What this source contains

The French Ministry of Culture publishes an open dataset of subsidized artistic-creation structures. Alongside many unrelated categories (Scène Nationale, Opéra en région, Centre Dramatique National, FRAC, ...), it includes two SMAC ("Scène de musiques actuelles") categories:

- `SMAC` — officially labelled.
- `SMAC en cours de labellisation` — in the process of being labelled.

This connector (`src/sources/connectors/smacDatasetConnector.ts`) fetches that dataset, keeps only the SMAC-related records, and normalizes them into the shared `LiveMusicEntityCandidate` shape from `src/sources/liveMusicEntities/` (issue #183) — the same domain model the OpenStreetMap connector (`overpassLiveMusicConnector.ts`) already produces candidates for.

**Real dataset schema** (verified live before implementing, 373 total records / 97 SMAC-related): `structure` (category), `nom1` (name), `nom2` (often the managing association/commune, not a display name), `adresse1`/`adresse2`, `cp` (postal code, a number — zero-padded when displayed), `ville` (city), `region`, `coordonnees_finales` (`{lat, lon}`, the reliable coordinate field — the top-level `latitude`/`longitude` fields are always null for SMAC records and are not used). **There is no department field and no stable external identifier in the real dataset.**

## Official dataset and licence

- Dataset page: https://www.data.gouv.fr/datasets/structures-de-la-creation-artistique-1
- Publisher: Ministère de la Culture
- Licence: Licence Ouverte (`fr-lo`)
- Stable JSON resource used by this connector: `SMAC_DATASET_JSON_URL` in `smacDatasetConnector.ts`

Every candidate's `sourceUrl` points to the dataset page above — individual SMAC records don't have their own public page in this dataset, so the JSON download URL is never used as a "website" and no per-venue website is invented.

## When it activates

- The connector self-gates on `ENABLE_SMAC_DISCOVERY` (defaults to enabled — a free, public, no-auth source, same policy as other stable free sources like scene agendas). Set `ENABLE_SMAC_DISCOVERY=false` to disable it.
- Independently of that flag, it should only ever be invoked for a search location that resolves to France. `src/sources/connectors/frenchLocationResolution.ts`'s `resolveCountryCodeFromLocationText()` handles this (no real geocoding exists in this codebase — it resolves an explicit country segment/name/code, or a bare major-French-city name, and returns `null` rather than guessing for anything else).
- **This is currently a standalone connector**, matching the Overpass connector's existing status: neither is wired into `runOpportunitySearch`/the CLI `booking` command yet. That wiring (deciding how `LiveMusicEntityCandidate`s become real search results) is scoped to later tickets (#184 enrichment/validation, #185 scoring).

## Caching

The parsed dataset is cached in-memory for 24 hours via the shared `TtlCache` (`src/utils/ttlCache.ts`), so it is fetched at most once per process regardless of how many searches run, with concurrent requests for the same key de-duplicated. `resetSmacDatasetCache()` clears it (used by tests).

## Geographic filtering

`filterSmacCandidatesByLocation(candidates, locationText, radiusKm)`:

1. If the location resolves to approximate coordinates (a small static table of ~25 major French cities), filters to candidates within the radius and sorts nearest-first.
2. If the location text names France itself (e.g. `"France"`), returns the full national SMAC set.
3. Otherwise falls back to normalized city/region text matching against the SMAC record's own city/region — never the full national list by default.

The city-coordinate table is a documented approximation, not real geocoding.

## Running the local test

```bash
npx tsx scripts/test-smac-discovery.ts --location "Bordeaux" --radius 100
npx tsx scripts/test-smac-discovery.ts --location "Bordeaux" --radius 100 --json
```

This hits the real, live dataset (no mocking) and prints dataset/candidate counts plus a readable list (name, city, region, distance, status, official-source indicator) or raw JSON.

## Limitations

- Confirms official SMAC status and location only. It never establishes genre compatibility, audience-size compatibility, whether a venue accepts unsolicited booking requests, recent programming activity, or upcoming availability — `LiveMusicEntityCandidate` has no genre/audience field, so there is nothing here to inflate a compatibility score with.
- No department field and no stable external identifier exist in the real dataset (contrary to what might be assumed).
- The city-coordinate fallback table only covers ~25 major cities; smaller towns fall through to the text-matching tier.
- Not wired into the live opportunity-search pipeline yet (see "When it activates" above).
