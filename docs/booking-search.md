# Booking Search

Booking Search helps an artist find realistic live opportunities they can review and contact manually.

The module should return a concise, sourced shortlist of places, organizations and events that plausibly fit the artist's genre, size, location and booking stage.

## Current CLI Behavior

The `booking` CLI command writes separated JSON outputs only:

- `outputs/booking/<run-id>/artist.json`
- `outputs/booking/<run-id>/similar-artists.json`
- `outputs/booking/<run-id>/booking.json`

The booking flow does not write CSV files. CSV export behavior is preserved for non-booking commands.

File responsibilities:

- `artist.json`: normalized artist or band data only.
- `similar-artists.json`: similar artists only. Similar artists are booking context, not booking opportunities.
- `booking.json`: booking opportunities only, plus booking source metadata, sources used and provider warnings.

The final CLI log always prints the exact generated JSON paths and summary counts.

## Provider Architecture

Booking sources sit behind `BookingSourceProvider`.

Each provider returns:

- provider name
- searched queries
- normalized `BookingTarget[]`
- provider warnings
- provider metadata

`searchBookingOpportunities()` deduplicates targets, applies booking relevance filters, scores them, preserves provider warnings and returns sorted booking opportunities.

Booking discovery is similar-artist-first:

1. Similar artists live history.
2. Specialized punk/metal/alternative scene agendas.
3. Venue/festival pages discovered from similar artists or scene agendas.
4. Promoters/organizers attached to those events.
5. OpenAgenda as secondary discovery.
6. Broad web discovery as fallback.

Similar artists are used as context only. They remain in `similar-artists.json` and must not be written as booking opportunities.

Normalized categories:

- `venue`
- `bar`
- `association`
- `collective`
- `festival`
- `springboard`
- `open_call`
- `promoter`
- `booking_agency`
- `live_producer`
- `event`

## Enabled Providers

### SimilarArtistLiveHistoryBookingSourceProvider

Runs first when web search is configured and similar artists are available in memory from the same booking run.

The provider keeps only similar artists with strong genre compatibility and useful popularity proximity:

- same tier: strongest signal
- up to 3x bigger: good aspirational signal
- 3x to 10x bigger: support-slot context
- more than 10x bigger: weak reference only
- much smaller artists: weaker booking discovery signal

It searches recent live dates, venue pages, festival pages and event pages for those artists. Booking reasons should explain the context, for example:

- `Similar artist X played this venue recently`
- `Similar artist X has comparable popularity`
- `Venue programmed compatible pop punk / emo artists`
- `Recent event date: YYYY-MM-DD`
- `Good support-slot target because similar artists were slightly bigger`

When available, booking opportunities include `derivedFromSimilarArtist` metadata with the similar artist name, popularity comparison, matched genres and source URL.

### SceneAgendaBookingSourceProvider

Runs after similar-artist live history and before OpenAgenda when scene agendas are enabled and a web search provider (Tavily, Exa, Jina, or Firecrawl) is configured.

The provider targets specialized punk, pop punk, hardcore, metal and alternative scene agendas before broad cultural databases:

- ConcertsPunk.fr
- Punk'n Roll Agenda
- Razibus
- France Punk Scene
- Concerts-metal.com is disabled by default because automated access can hit `check_bot` or bot-protection pages.

Scene agenda providers normalize public search results into sourced `BookingTarget` candidates with:

- `sourceType: specialized_scene_agenda`
- provider name in `sourceProvider`
- source URL preserved from the result
- event date when parseable
- venue/lineup/genre clues when detected
- unknown contact when no public contact is present

They reuse the central booking relevance filters. Future events are preferred, recent past events are kept only within `BOOKING_RECENT_EVENT_MONTHS` for venue-history context, and old or incompatible events are rejected before ranking.

For pop punk, punk rock, punk, emo, emo pop, easycore, skate punk, melodic punk and hardcore punk are strong signals. Generic `rock`, `concert`, `musiques actuelles` or `alternative` alone is not enough. Metal-only events are rejected for pop punk unless the text also contains punk/hardcore crossover evidence.

Support-slot opportunities are inferred only from public wording such as `+ guest`, `support TBA`, `première partie à venir`, `line-up soon` or `guests TBA`. The CLI warning must say `Support slot is inferred, not confirmed.` unless the source explicitly confirms availability.

When a similar artist appears in a scene agenda lineup or source text, the provider adds `derivedFromSimilarArtist` metadata and ranking gets a source-context boost.

Scene agendas are **enabled by default**. Set `ENABLE_SCENE_AGENDAS=false` to disable them explicitly.

Configuration:

- `ENABLE_SCENE_AGENDAS` — defaults to `true`; set to `false` to disable
- `ENABLE_CONCERTS_PUNK` — override; punk genres auto-select this source
- `ENABLE_PUNKNROLL_AGENDA` — override; punk genres auto-select this source
- `ENABLE_RAZIBUS` — override; punk genres auto-select this source
- `ENABLE_FRANCE_PUNK_SCENE` — override; requires a URL to be useful
- `ENABLE_CONCERTS_METAL=false` (default, disabled to avoid bot protection)

The GitHub Actions booking workflow exposes these flags as `workflow_dispatch` inputs. They do not require secrets.

### NativeFetchSceneAgendaProvider

Fetches public RSS feeds directly from scene agenda sites using plain HTTP. **Does not require any web search API key.** Runs whenever scene agendas are enabled, regardless of whether a web search provider is configured.

This provider is the primary fallback when Firecrawl is unavailable and no paid search provider (Tavily, Exa, Jina) is configured.

It fetches configured URLs, parses HTML event listings (and RSS/Atom when available), and applies the same genre/location relevance filters as the search-based provider.

**Genre-based auto-selection:** for pop punk, punk, emo, easycore, skate punk, melodic punk, and hardcore punk, ConcertsPunk, Razibus, and PunknRollAgenda are selected automatically without requiring env flags. Env flags are overrides only.

Configuration:

- `CONCERTS_PUNK_URL` — Listing URL for ConcertsPunk. Defaults to `https://www.concertspunk.fr/?country=fr`.
- `RAZIBUS_URL` — Listing URL for Razibus. Defaults to `https://razibus.net/evenements-a-venir.php`.
- `PUNKNROLL_AGENDA_URL` — Listing URL for Punk'n Roll Agenda. Defaults to `https://agenda.punknroll.fr/`.
- `FRANCE_PUNK_SCENE_URL` — Listing URL for France Punk Scene. No default; set explicitly to enable.

Only sources with a configured URL (default or explicit) and a compatible genre are fetched. FrancePunkScene is disabled with a descriptive warning when no URL is configured — it is not silently skipped.

Safety rules:

- Only public pages are fetched; no login, CAPTCHA bypass, or paywall.
- Fetch timeout is 10 seconds.
- Blocked/protected pages are skipped with a warning.
- Bot-protection signals in response body trigger a skip.
- User-Agent header: `ArtistRadar/1.0 (booking search)`.

### MockBookingSourceProvider

Used only when explicitly enabled by the existing mock/dev convention, such as `MOCK_AI=true`.

Mock data must stay in the mock provider or tests.

### WebSearchBookingSourceProvider (Tavily, Exa)

Runs web search queries through configured search providers. **Tavily and Exa are optional.** If an API key is present and the provider is not explicitly disabled, it is enabled automatically — no explicit `true` flag required.

**Tavily configuration:**

- `TAVILY_API_KEY` — required to enable Tavily
- `ENABLE_TAVILY_BOOKING=false` — explicitly disable even when key is present

**Exa configuration:**

- `EXA_API_KEY` — required to enable Exa
- `ENABLE_EXA_BOOKING=false` — explicitly disable even when key is present

Representative query patterns for pop punk booking:

- `pop punk concert Paris première partie`
- `punk rock concert Paris support`
- `pop punk concerts France 2026`
- `site:concertspunk.fr pop punk France`

### JinaReader

Jina Reader is used for extraction of known URLs (turning a venue or event page into readable markdown). **Does not require an API key for basic use.**

- `JINA_API_KEY` — optional; set to authenticate and increase rate limits
- `ENABLE_JINA_READER=false` — explicitly disable

### FirecrawlBookingSourceProvider

Composes the existing Firecrawl-backed web search and extraction abstractions. **Firecrawl is optional.** Booking search works without it using scene agendas and other configured providers.

It should be used for official venue pages, programming pages, contact pages, application pages and event pages.

**Enabling Firecrawl for booking:**

- `ENABLE_FIRECRAWL_BOOKING=true` with `FIRECRAWL_API_KEY` set → Firecrawl booking enabled.
- `ENABLE_FIRECRAWL_BOOKING=false` → Firecrawl booking disabled, even if `FIRECRAWL_API_KEY` is present.
- `ENABLE_FIRECRAWL_CONSOLIDATION=true` with `FIRECRAWL_API_KEY` set → Firecrawl booking enabled (backward-compatible alias).
- Neither flag set → Firecrawl booking disabled.

**Quota and credit handling:**

If Firecrawl returns HTTP 402, 429, or 503 with a quota/credits error body, the provider automatically disables itself for the rest of the run and emits the warning:

```
Firecrawl disabled for this run: quota or credits unavailable (HTTP <status>).
```

No crash, no silent failure — the booking run continues using the remaining providers (scene agendas, OpenAgenda, web search).

### OpenAgendaBookingSourceProvider

Disabled by default in local runs. The GitHub Actions booking CLI workflow sets `ENABLE_OPENAGENDA=true` by default and uses GitHub Actions secrets for real OpenAgenda runs.

OpenAgenda is secondary. It should provide candidates, not final trusted opportunities, and those candidates are filtered before ranking.

Documented configuration only:

- `ENABLE_OPENAGENDA=true`
- `OPENAGENDA_API_KEY`, configured as the `OPENAGENDA_API_KEY` GitHub Actions secret for real OpenAgenda runs
- optional `OPENAGENDA_AGENDA_UIDS`, a comma-separated GitHub Actions secret override for known agenda UIDs
- optional `OPENAGENDA_BASE_URL`

`ENABLE_OPENAGENDA_BOOKING=true` and `OPENAGENDA_AGENDA_UID` are kept only as backward-compatible aliases.

Agenda UID resolution order:

- `OPENAGENDA_AGENDA_UIDS` override when provided.
- seed config in `src/booking/config/openAgendaSeeds.ts` when a matched location has verified agenda UIDs.
- OpenAgenda public agenda discovery from explicit CLI city/target locations, artist profile location, nearby cities for known artist locations, and major French cities only when the target requests `grandes villes françaises` or equivalent France-wide wording.

`OPENAGENDA_AGENDA_UIDS` is optional. The provider works without it by discovering agendas from location and genre keywords. The seed config starts with major French cities, empty `agendaUids`, booking keywords and nearby cities; it is a future database precursor, not a database. If seed `agendaUids` are empty, discovery is used. Do not hardcode one global agenda UID for all booking runs.

OpenAgenda discovery uses city/region/location terms, genre-aware keywords and music keywords such as concert, musiques actuelles, festival, tremplin and appel à candidature. When agenda discovery finds useful UIDs, the provider stores selected agenda UIDs, agenda source URLs, discovery locations, discovered UIDs and event source URLs in provider metadata and warnings so they can later be reviewed for the seed config. If discovery finds no relevant public agendas, the provider returns an empty result with a clear warning.

When `ENABLE_OPENAGENDA=true` but `OPENAGENDA_API_KEY` is missing, the provider is disabled with a warning instead of exposing secret values or crashing unrelated booking flow.

OpenAgenda candidates must pass strict relevance checks:

- future events are kept
- recent past events are kept only within the configured recent window
- events older than the recent window are rejected
- missing dates are rejected unless source confidence is high
- exact or related genre evidence is required
- `music`, `concert`, `rock` or city match alone is not enough
- incompatible explicit genre evidence is rejected

The recent event window defaults to 24 months and can be configured with:

- `BOOKING_RECENT_EVENT_MONTHS=24`

The manual GitHub Actions workflow can be configured with `workflow_dispatch` inputs for artist, city, genre, target, limit, `enable_openagenda` and optional `openagenda_agenda_uids`. Secrets are read from GitHub Actions secrets and must not be hardcoded or printed.

Do not add these values to `.env` in code changes.

## Provider Priority

For pop punk booking, providers run in this order:

1. **Direct scene agenda fetch** (NativeFetchSceneAgendaProvider) — ConcertsPunk, Razibus, PunknRollAgenda auto-selected; no API key required
2. **Similar artist live history** — uses first available search provider (Tavily → Exa → Firecrawl)
3. **Scene agenda web search** — uses first available search provider against scene agenda sites
4. **Web search providers** — one provider per enabled Tavily/Exa key
5. **OpenAgenda** — secondary; requires `ENABLE_OPENAGENDA=true` and `OPENAGENDA_API_KEY`
6. **Firecrawl** — optional; requires `ENABLE_FIRECRAWL_BOOKING=true` and `FIRECRAWL_API_KEY`

Booking search works with zero API keys — native scene agenda fetch runs by default for punk genres.

## Environment Variable Reference

| Variable | Purpose | Default |
|---|---|---|
| `TAVILY_API_KEY` | Enables Tavily search for booking | — |
| `EXA_API_KEY` | Enables Exa semantic search for booking | — |
| `JINA_API_KEY` | Authenticates Jina Reader extract | — (works without) |
| `FIRECRAWL_API_KEY` | Enables Firecrawl search/extract | — |
| `ENABLE_TAVILY_BOOKING` | `false` to disable Tavily even with key | enabled if key present |
| `ENABLE_EXA_BOOKING` | `false` to disable Exa even with key | enabled if key present |
| `ENABLE_JINA_READER` | `false` to disable Jina Reader | `true` |
| `ENABLE_FIRECRAWL_BOOKING` | `true` to enable Firecrawl booking | `false` |
| `ENABLE_SCENE_AGENDAS` | `false` to disable scene agendas | `true` |
| `CONCERTS_PUNK_URL` | Override ConcertsPunk listing URL | `https://www.concertspunk.fr/?country=fr` |
| `RAZIBUS_URL` | Override Razibus listing URL | `https://razibus.net/evenements-a-venir.php` |
| `PUNKNROLL_AGENDA_URL` | Override Punk'n Roll Agenda listing URL | `https://agenda.punknroll.fr/` |
| `FRANCE_PUNK_SCENE_URL` | Set France Punk Scene listing URL | — (disabled by default) |

## Future Providers

These are documented extension points, not active dependencies:

- `ApifyProvider`
- `BandsintownProvider`
- `EventbriteProvider`
- `PublicCultureDataProvider`
- `VenueWebsiteScraperProvider`

Future providers should implement `BookingSourceProvider` and return normalized `BookingTarget` records.

## Source Safety Rules

- Preserve source URLs from provider records.
- Preserve contact source URLs when available.
- Do not invent contacts, organizer names, event availability, deadlines, capacities or source URLs.
- Contacts must come from public source text or public links.
- Unknown contacts stay `null`.
- Support slots are inferred unless the source explicitly confirms them.
- Provider failures should return warnings, not crash the CLI.
- Do not bypass bot protections, paywalls, logins, CAPTCHAs, `check_bot` pages, anti-bot pages or robots restrictions.
- Do not scrape aggressively. Prefer existing provider abstractions, cache/rate limits and sourced public search results.
- If a scene provider detects blocked/protected access, it must skip the result or disable the provider with a clear warning.
- Future seed/database work may store trusted scene sources by genre and country, but no database is used in the MVP.

## Relevance Filters

Booking relevance filters run before scoring/ranking.

For pop punk, strong signals include pop punk, punk rock, emo, emo pop, easycore, skate punk and melodic punk. Medium signals such as alternative rock are accepted only with punk/emo evidence. Generic `rock`, `concert`, `musique` or `musiques actuelles` alone is insufficient.

Explicit incompatible genre evidence such as jazz-only, classical, techno-only, rap-only, metal-only without punk/hardcore crossover, chanson-only, or cover-band-only programming is rejected or heavily deprioritized.

Ranking applies source priority after compatibility scoring. Similar-artist live history ranks first, then strongly matched specialized scene agenda results, official venue programming pages, official festival pages and promoter/organizer official pages. OpenAgenda can still rank when date and genre evidence are strong, but it is secondary and must not flood the shortlist.

## MCP Usage

MCP tools can help agents search, inspect and validate sources during development.

Production booking code should not depend on an MCP runtime. Production integrations should use provider interfaces backed by REST/API clients or existing internal abstractions.
