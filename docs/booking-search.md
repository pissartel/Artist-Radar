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

Runs after similar-artist live history and before OpenAgenda when `ENABLE_SCENE_AGENDAS=true` and a web search provider is configured.

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

Configuration:

- `ENABLE_SCENE_AGENDAS=true`
- `ENABLE_CONCERTS_PUNK=true`
- `ENABLE_PUNKNROLL_AGENDA=true`
- `ENABLE_RAZIBUS=true`
- `ENABLE_FRANCE_PUNK_SCENE=true`
- `ENABLE_CONCERTS_METAL=false`

The GitHub Actions booking workflow exposes these flags as `workflow_dispatch` inputs. They do not require secrets.

### MockBookingSourceProvider

Used only when explicitly enabled by the existing mock/dev convention, such as `MOCK_AI=true`.

Mock data must stay in the mock provider or tests.

### WebSearchBookingSourceProvider

Wraps the existing internal web search and extraction abstractions when a web search provider is configured.

Representative query patterns:

- `<genre> concert venue <city> programmation`
- `<genre> café-concert <city>`
- `<genre> association concerts <city>`
- `<genre> festival appel à candidature`
- `<genre> support TBA <city>`

### FirecrawlBookingSourceProvider

Composes the existing Firecrawl-backed web search and extraction abstractions.

It is disabled unless the existing Firecrawl configuration is present. It should be used for official venue pages, programming pages, contact pages, application pages and event pages.

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

## Future Providers

These are documented extension points, not active dependencies:

- `ApifyProvider`
- `TavilyProvider`
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
