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

### Similar-artist concert-history venue discovery (issue #182)

Complements `SimilarArtistLiveHistoryBookingSourceProvider`'s free-text web search with a second, structured path: instead of inferring a venue from prose, it queries structured concert-history APIs for a curated set of similar artists and extracts venues from their **actual past concerts**, attaching hard evidence (artist, event, date, source URL) to each venue candidate. It is additive — the existing web-search-based discovery (and issue #168's `VenueDiscoveryBookingSourceProvider`) is untouched and keeps running unchanged.

**Provider-neutral interface** (`src/booking/artistEventHistory.ts`):

```ts
interface ArtistEventHistoryProvider {
  providerName: string;
  findPastEvents(input: {
    artistName: string;
    artistExternalIds?: Record<string, string>;
    countries?: string[];
    dateFrom?: string;
    dateTo?: string;
  }): Promise<HistoricalArtistEvent[]>;
}
```

Adding a new provider (e.g. Bandsintown, Songkick) means implementing this interface and registering it in `BookingSourceProvider.ts`'s `eventHistoryProviders` array — the selection/dedup/venue-building pipeline never needs to change.

**Pipeline:**

1. `selectSimilarArtistsForLiveHistory` picks up to `MAX_SIMILAR_ARTISTS_FOR_VENUE_DISCOVERY` (default 10) similar artists, favoring a mix of strong genre matches, small/medium/local artists and artists with an audience reasonably close to the target — deliberately broader than the stricter selection used by the free-text path, so large reference artists don't dominate.
2. `fetchHistoricalEventsForSimilarArtists` fans out to every configured `ArtistEventHistoryProvider` for every selected artist, with bounded artist concurrency (`mapWithConcurrency`, default concurrency 3) and `Promise.allSettled` per artist × provider call. A failing provider/artist pair never aborts the rest — it's recorded as a warning (`"<providerName> failed for \"<artistName>\": <message>"`) and a structured diagnostic, and the search continues with whatever succeeded.
3. `dedupeHistoricalArtistEvents` deterministically merges duplicate events (same normalized artist name, date, venue name, city and source URL).
4. `buildVenueTargetsFromArtistEventHistory` groups events into one `BookingTarget` per venue (`category: "venue"`, already evergreen per issue #168 — no upcoming date is required), attaching one `VenueArtistEvidence` record per matching historical event so a later scoring/UI ticket can state e.g. "this venue programmed 3 similar artists in the last 18 months."

**Venue deduplication:** venue identity is normalized name + city + country. Normalization strips a leading French article (`Le`/`La`/`Les`/`L'`) and a trailing city-name suffix, so `Le Krakatoa`, `Krakatoa` and `Krakatoa Mérignac` (city: Mérignac) all resolve to the same venue. Only the identity key is normalized — the displayed venue name is left as reported by the source.

**Confidence** is computed deterministically (never by an LLM) from: source officialness, location match, recency, similar-artist popularity proximity (per-event evidence), plus number of independent similar artists confirming the venue, evidence count, recent-event count and official-source count (aggregate candidate confidence). Individual signals are kept on each `VenueArtistEvidence` record rather than only an unexplained aggregate number.

**No LLM calls**: both providers below return fully structured JSON (event name/date, venue name/city/country, source URL) — deterministic parsing only.

#### OpenAgendaArtistEventHistoryProvider

Default/primary structured source. Reuses `OpenAgendaBookingSourceProvider`'s agenda discovery/config-override resolution (`discoverAgendas`, `findMatchingOpenAgendaSeeds`, agenda UID env overrides, `src/booking/config/openAgendaSeeds.ts` seeds) rather than re-implementing location-to-agenda matching, **plus** a supplementary venue-focused agenda search (see below). Agenda resolution is memoized per resolved country for the lifetime of the provider instance (one booking search), so discovery runs at most once per country even though `findPastEvents` is called once per similar artist. Each artist then only costs one lightweight `search=<artistName>` events call per resolved agenda (capped at 5 agendas), with `timings[gte]`/`timings[lte]` applied for the recency window.

Gated by the same flags as `OpenAgendaBookingSourceProvider`: `ENABLE_OPENAGENDA=true` (or `ENABLE_OPENAGENDA_BOOKING=true`) and `OPENAGENDA_API_KEY`. No new required configuration.

Two data-quality issues were found and fixed by live-probing the real OpenAgenda API while validating this feature, both load-bearing enough to document here:

1. **Agenda-discovery relevance.** The shared discovery's scoring (`scoreAgenda` in `OpenAgendaBookingSourceProvider.ts`) gives a plain location-text match enough score to reach its top-5 cut, so for a country-level query its results are often dominated by places whose name merely contains the location (e.g. "Puiseux-en-France", "Info Jeunes France") rather than actual live-music venues — an artist-name search against those agendas then almost never matches anything, regardless of the artist's popularity. Fixed with (a) a supplementary agenda search scoped to a venue-focused keyword phrase (`salle de musiques actuelles SMAC club concerts programmation`), filtered by a live-music title pattern *before* any ranking/truncation happens, merged with (b) the shared discovery's own results, also title-filtered as a safety net.
2. **False-positive artist matches.** OpenAgenda's `search` parameter matches individual words, not the full artist name as a phrase — confirmed live: searching `"Feu! Chatterton"` returned events about fireworks and a traffic-light-themed show, all matched on the standalone French word "feu" (fire), none of which had anything to do with the band. Every candidate is now re-verified after fetching: the artist name must actually appear (accent/punctuation-normalized) in the event's own title, description or keywords, or it's discarded — never trusted on OpenAgenda's search relevance alone.

Most events also don't carry an external `canonicalUrl`/`url`/`registrationUrl` field; when absent, the provider builds a real, verified-working `https://openagenda.com/{agendaSlug}/events/{eventSlug}` page from the event's own slug and its owning agenda's slug (using the event's `originAgenda` when it was surfaced through an aggregator agenda) — never a fabricated link.

Known limitation: OpenAgenda's coverage is inherently federated (each venue/organizer publishes its own agenda), so even with better agenda selection, a booking search only checks a handful of agendas per country/run; a specific similar artist genuinely not having played any of those particular venues is an expected, honest "no evidence found" result, not a bug. Without seeded or env-configured agenda UIDs for a location, the first run for that location also pays the discovery cost.

#### MusicBrainzArtistEventHistoryProvider

Complementary source, **opt-in and off by default** via `ENABLE_MUSICBRAINZ_EVENT_HISTORY=true` — never the sole source. Resolves each similar artist's MusicBrainz ID (reusing `searchMusicBrainzArtistByName`, memoized per artist name for the provider instance's lifetime) then browses MusicBrainz's `event` entity (`GET /ws/2/event?artist=<mbid>&inc=place-rels`) for events carrying a `place` (venue) relation. Both the MBID lookup and the event browse are serialized through the existing shared `scheduleMusicBrainzRequest` queue, so the global MusicBrainz 1-request/second rate limit is respected automatically alongside any other MusicBrainz usage in the same process.

Known limitations: MusicBrainz event/venue data is community-contributed and far sparser than OpenAgenda's — many similar artists will simply have no MusicBrainz events. A place's `area` is used as a best-effort city (never a verified administrative city), and country is left `null` rather than guessed, since it isn't reliably derivable from a place's `area` alone.

**Configurable limits** (`src/booking/artistEventHistory.ts`, env-overridable, same pattern as `BOOKING_RECENT_EVENT_MONTHS`):

- `MAX_SIMILAR_ARTISTS_FOR_VENUE_DISCOVERY = 10` — override with `BOOKING_MAX_SIMILAR_ARTISTS_FOR_VENUE_HISTORY`
- `MAX_HISTORICAL_EVENTS_PER_ARTIST = 20` — override with `BOOKING_MAX_HISTORICAL_EVENTS_PER_ARTIST`
- `HISTORICAL_EVENT_LOOKBACK_MONTHS = 24` — override with `BOOKING_HISTORICAL_EVENT_LOOKBACK_MONTHS`

**Cache/cost controls:** all "cache" here is the same in-memory, per-run `Map<string, Promise<T>>` memoization pattern already used elsewhere in the codebase (e.g. `similarArtistsFinder.ts`'s MusicBrainz genre lookups) — scoped to one booking search, not a persistent cross-run cache. Artist concurrency is bounded (`mapWithConcurrency`, default 3); each artist-provider call is capped to `MAX_HISTORICAL_EVENTS_PER_ARTIST` events; agenda/MBID resolution is memoized so it isn't repeated for every similar artist.

**Works without a web search API key:** unlike the free-text half of `SimilarArtistLiveHistoryBookingSourceProvider`, `eventHistoryProviders` don't require Tavily/Exa/Firecrawl — `BookingSourceProvider.ts` registers a structured-only instance of the provider when no web search key is configured but at least one event-history provider (OpenAgenda or MusicBrainz) is enabled.

**Manual validation:** run the CLI `booking` command for an artist with `ENABLE_OPENAGENDA=true` (optionally `ENABLE_MUSICBRAINZ_EVENT_HISTORY=true`) and inspect `outputs/booking/<run-id>/booking.json` for `venue` opportunities whose `target.venueArtistEvidence` carries real source URLs for each similar artist's past concert there. Tuesday Fall (Spotify ID `2RO6dHJK11CKcEg1G7XYps`, pop punk, Paris, target "grandes villes françaises") is a useful manual example — not hardcoded application logic.

### TicketmasterBookingSourceProvider

Disabled by default. Requires both `ENABLE_TICKETMASTER_CONCERTS=true` and `TICKETMASTER_API_KEY`; missing either skips the provider with a clear debug log (scope `ticketmaster`, `DEBUG_TICKETMASTER_CONCERTS=true`) and the rest of the pipeline continues normally.

Runs three complementary searches against the official Ticketmaster Discovery API v2 (`events.json`, `attractions.json`, `venues.json`) rather than one large generic query:

- **Genre + location** — `segmentName=Music`, one query per mapped Ticketmaster classification (`src/providers/ticketmaster/genreMapping.ts`'s `ticketmasterGenreMappings`, e.g. `pop punk` → `Punk`, `Alternative Rock`, `Rock`; not exhaustive), scoped to the user-entered city (preferred) or the artist profile's city, with a configurable radius. Only upcoming events are kept as targets.
- **Similar artists** — the same top-N-by-compatibility selection used elsewhere in the codebase (`SimilarArtist.totalRelevance`, deterministic, never random), bounded to `TICKETMASTER_SIMILAR_ARTIST_LIMIT` artists processed with concurrency `DEFAULT_TICKETMASTER_CONCURRENCY = 2`. For each artist: resolves a Ticketmaster attraction (`resolveAttraction` — deterministic scoring on exact/alias/substring name match, required Music classification, genre compatibility; `ambiguous`/`not_found` results skip event retrieval for that artist rather than guessing), then fetches upcoming events plus a best-effort, bounded past-events query (`TICKETMASTER_PAST_LOOKBACK_MONTHS`).
- **Venue/scene evidence** — every similar artist's events are aggregated by venue (`src/modules/ticketmasterEvidence.ts`) and by city/region, feeding a `venueCompatibilityScore` (more compatible artists, more recent activity, upcoming events all increase it) and exposed on the pipeline result (see below), not just used internally.

**Known Ticketmaster limitations, preserved deliberately rather than papered over:**

- Not a complete source of small DIY concerts, bars, associations, full lineups, past concert history, or venue booking contacts — only events sold/distributed through Ticketmaster-affiliated systems.
- Past-event queries are best-effort and opportunistic. Zero results never means "this artist has never played anywhere" — the provider never reconstructs a full career history.
- Lineup completeness is uncertain. A single listed attraction on a future event produces a hedged `supportSlotSignal: "possible"` heuristic (with an explicit, always-present explanation sentence) — never a confirmed "support slot available" claim. Multiple listed attractions produce `"unlikely"`. Festivals/multi-day events are detected separately (`eventType: "festival"`, from event name, classification, or attraction count ≥ 4) and are never evaluated for a standalone venue support slot.
- Attraction name resolution never automatically picks the first search result: two similarly-scored candidates are reported `ambiguous` and that artist's event retrieval is skipped entirely, even if that means missing real data, rather than risk attributing events to the wrong artist.

**Cost controls:** every event/attraction/venue query is memoized per exact parameter shape for the lifetime of the provider instance (one booking search); retries are bounded (max 2) and only for HTTP 429/5xx, never for 400/401/403/404; the API key travels as a URL query parameter (Ticketmaster's own requirement) and is redacted from any logged URL (`src/utils/fetchWithTimeout.ts`'s `redactUrlForLogging`) so it never appears in debug output.

**Cross-provider deduplication:** Ticketmaster events merge with existing OpenAgenda/web-discovered targets when they share a calendar date and a normalized-equal venue name (or matching city as a fallback when venue-name evidence is missing on one side) — never on event title alone. A merge preserves the richer venue/lineup/image/contact data from either side and keeps the second source's URL as an evidence line (`src/booking/searchBookingOpportunities.ts`'s `dedupeTargets`/`mergeBookingTargets`), since `BookingTarget` carries one primary `sourceUrl`, not a list.

**Optional configuration:**

- `TICKETMASTER_COUNTRY_CODE` — explicit ISO code; otherwise resolved from the artist profile's country name via a small, non-exhaustive lookup table, or omitted entirely (never hardcoded to one country — the same implementation works for Bordeaux, Lyon, Lille, Nantes, Toulouse, or cities outside France).
- `TICKETMASTER_SEARCH_RADIUS_KM` (default 100), `TICKETMASTER_EVENT_LIMIT` (default 50), `TICKETMASTER_SIMILAR_ARTIST_LIMIT` (default 5), `TICKETMASTER_LOOKAHEAD_MONTHS` (default 12), `TICKETMASTER_PAST_LOOKBACK_MONTHS` (default 18).

**Pipeline output:** `OpportunitySearchRunResult.ticketmaster` (booking mode only, optional — undefined when Ticketmaster is disabled or the run isn't in booking mode) exposes `opportunities` (a filtered view of the already-scored/deduped booking opportunities whose `sourceProvider` is `"ticketmaster"`, not a second ranking system), `similarArtistEvents`, `venueEvidence`, `sceneEvidence` and `diagnostics` (query/cache/error counters — never the API key or raw request headers).

**Known limitation:** no real `TICKETMASTER_API_KEY` was available while implementing this, so the client/adapter is built against Ticketmaster's documented public Discovery API v2 contract but has not been live-verified. Run the manual CLI test below with a real key before relying on this in production, and specifically double-check attraction search relevance (an API's own "search"/"keyword" matching sometimes matches more loosely than its documentation implies — this exact category of issue was found and fixed once already, for OpenAgenda, elsewhere in this booking pipeline).

**Manual CLI test:**

```bash
DEBUG_TICKETMASTER_CONCERTS=true ENABLE_TICKETMASTER_CONCERTS=true TICKETMASTER_API_KEY=... \
npx tsx src/cli.ts booking --artist "Tuesday Fall" --city "Paris" --genre "pop punk"
```

With no key configured, the startup log reports `Ticketmaster: disabled (TICKETMASTER_API_KEY is missing)` and the rest of the pipeline runs unaffected.

Example debug output:

```text
[ticketmaster] Integration enabled
[ticketmaster] Search location: Paris, FR
[ticketmaster] Radius: 100 km
[ticketmaster] Target genres: pop punk
[ticketmaster] Ticketmaster classifications: Punk, Alternative Rock, Rock
[ticketmaster] [genre-search] Searching future events
[ticketmaster] [genre-search] Raw events: 48
[ticketmaster] [genre-search] Relevant events after scoring: 12
[ticketmaster] [similar-artists] Found 34 similar artists
[ticketmaster] [similar-artists] Selected top 5
[ticketmaster] [similar-artists] 1. Artist A — compatibility: 0.91
[ticketmaster] [Artist A][attraction] Searching attraction
[ticketmaster] [Artist A][attraction] Resolved to K8vZ... — confidence: 0.97
[ticketmaster] [Artist A][events] Past: 1 | Upcoming: 4
[ticketmaster] [deduplication] Raw opportunities: 22
[ticketmaster] [deduplication] Final opportunities: 15
[ticketmaster] Top opportunities:
[ticketmaster] 0.89 | 2026-10-12 | Artist A | Venue Name | Paris
[ticketmaster] 15 relevant events and 9 compatible venues found
```

When `DEBUG_TICKETMASTER_CONCERTS` is not set, only the final one-line summary prints.

### OpenAIWebSearchConcertProvider

Disabled by default. Complements Ticketmaster/OpenAgenda for emerging artists, DIY venues and past shows that structured APIs rarely cover. **It is a discovery and extraction provider, not an authoritative concert database** — every accepted concert must have supporting web evidence and pass application-level validation; a provider failure or "no results found" is never reported as proof that an artist has no concerts.

For the top `OPENAI_CONCERT_SIMILAR_ARTIST_LIMIT` (default 5) most compatible similar artists, it calls the OpenAI Responses API with the built-in `web_search` tool once per artist (one consolidated call covering both the past and upcoming date window, not one call per event), requesting strict Structured Outputs validated against a Zod schema.

**Anti-hallucination guardrails:**

- Every event must be backed by at least one source URL that also appears among the response's own real `url_citation` annotations — a URL only present in the model's JSON but not actually cited by the web-search tool is dropped, and the event is rejected if no valid source remains.
- Event dates are validated programmatically against the requested past/upcoming window; an unparsable or out-of-window date is rejected. Past-vs-upcoming status is always recalculated from the date, never trusted from the model's own field (cancelled/postponed are preserved, since those aren't date facts).
- Artist identity is checked before any of its concerts are used: an exact normalized name match is required, or a sufficiently high model-reported identity confidence; ambiguous or rejected identities discard that artist's results entirely rather than risk a homonym.

**Verification levels** (only `confirmed`/`probable` become booking opportunities; `unverified`/`rejected` are diagnostics only):

- `confirmed` — an official artist/venue/festival/promoter source, a trusted ticketing source, or two independent credible (agenda/press) sources agreeing.
- `probable` — a single credible cultural-agenda or press source with a complete date and venue.
- `unverified` — incomplete date/venue, or only weak (social/other) sources.
- `rejected` — invalid date, missing venue, or no source surviving citation cross-validation.

Support-slot signals are always hedged (`possible`/`unlikely`/`unknown`), never a confirmed claim, using the same lineup-count heuristic as the rest of the booking pipeline.

Caching is per-run memoization only (one call per unique artist + date window, for the duration of a single CLI invocation) — matching every other provider in this codebase. There is no persistent cross-run cache; repeated CLI runs re-query OpenAI.

Configuration:

- `ENABLE_OPENAI_CONCERT_DISCOVERY=true` — required to enable; reuses `OPENAI_API_KEY`
- `OPENAI_CONCERT_MODEL` — defaults to `gpt-4.1-mini`
- `OPENAI_CONCERT_SIMILAR_ARTIST_LIMIT` — defaults to `5`
- `OPENAI_CONCERT_PAST_MONTHS` — defaults to `18`
- `OPENAI_CONCERT_UPCOMING_MONTHS` — defaults to `12`
- `OPENAI_CONCERT_MAX_EVENTS_PER_ARTIST` — defaults to `10`
- `OPENAI_CONCERT_CONCURRENCY` — defaults to `1`
- `DEBUG_OPENAI_CONCERTS=true` — detailed per-artist logs (raw/confirmed/probable/unverified/rejected counts, rejection reasons); a concise one-line summary always prints regardless

**Estimated API calls per artist analysis:** 1 OpenAI Responses API call per selected similar artist (default 5), so 5 calls per run — no per-event or per-query-variation calls.

Manual CLI test:

```
DEBUG_OPENAI_CONCERTS=true ENABLE_OPENAI_CONCERT_DISCOVERY=true npx tsx src/cli.ts booking \
  --artist "Tuesday Fall" --city "Paris" --genre "pop punk" --target "France"
```

Expected debug output (abridged):

```
[openai-concerts] Integration enabled
[openai-concerts] Model: gpt-4.1-mini
[openai-concerts] Selected 5 similar artists
[openai-concerts] 1. Mina Warren — compatibility: 0.87
[openai-concerts] [Mina Warren] Search triggered
[openai-concerts] [Mina Warren] Date windows: past=2025-01-24..2026-07-23 upcoming=2026-07-24..2027-07-24
[openai-concerts] [Mina Warren] Raw extracted events: 7
[openai-concerts] [Mina Warren] Confirmed: 4
[openai-concerts] [Mina Warren] Probable: 2
[openai-concerts] [Mina Warren] Unverified: 0
[openai-concerts] [Mina Warren] Rejected: 1
[openai-concerts] [Mina Warren] REJECT event reason=missing_source_url date=2025-04-12 venue=Unknown
[openai-concerts] Found 12 verified concert records for 5 similar artists
```

### OpenAIOpportunityDiscoveryProvider

Disabled by default. This is the first-class OpenAI Web Search booking discovery provider. It runs alongside structured providers and normal web-search providers, and switches to expanded mode when provider health is degraded (for example Firecrawl quota/402, ConcertsPunk blocked, or Tavily returning no results).

It uses separate structured discovery prompts for festivals, venues, similar-artist concert history, upcoming concerts, and promoters/associations. OpenAI returns sourced discovery candidates only; the existing booking pipeline still normalizes, deduplicates, filters, scores, and decides actionability.

Configuration:

- `OPENAI_BOOKING_DISCOVERY_ENABLED=true` — enables this provider; reuses `OPENAI_API_KEY`
- `OPENAI_BOOKING_DISCOVERY_MODE` — `standard`, `expanded`, or unset/`auto`; degraded provider health forces expanded mode
- `OPENAI_BOOKING_DISCOVERY_MODEL` — defaults to `gpt-4.1-mini`
- `OPENAI_BOOKING_MAX_SEARCH_CALLS` — caps specialized discovery calls; defaults to `5` standard / `10` expanded
- `OPENAI_BOOKING_MAX_ARTISTS` — caps similar artists included in discovery prompts; defaults to `10`
- `OPENAI_BOOKING_MAX_CANDIDATES_PER_TYPE` — caps accepted OpenAI candidates per type; defaults to `20`

OpenAI opportunity discovery keeps venues, festivals, promoters and associations even when optional data such as contact, capacity or a future date is missing. Event opportunities remain strict: they need a verified ISO date, at least 30 full days of lead time, target-country fit and compatible source evidence.

## Provider Priority

For pop punk booking, providers run in this order:

1. **Direct scene agenda fetch** (NativeFetchSceneAgendaProvider) — ConcertsPunk, Razibus, PunknRollAgenda auto-selected; no API key required
2. **Similar artist live history** — uses first available search provider (Tavily → Exa → Firecrawl); its structured concert-history path (OpenAgenda/MusicBrainz) runs alongside it, or on its own when no search provider is configured
3. **Scene agenda web search** — uses first available search provider against scene agenda sites
4. **Web search providers** — one provider per enabled Tavily/Exa key
5. **OpenAgenda** — secondary; requires `ENABLE_OPENAGENDA=true` and `OPENAGENDA_API_KEY`
6. **Ticketmaster** — optional; requires `ENABLE_TICKETMASTER_CONCERTS=true` and `TICKETMASTER_API_KEY`
7. **Firecrawl** — optional; requires `ENABLE_FIRECRAWL_BOOKING=true` and `FIRECRAWL_API_KEY`
8. **OpenAI Web Search concert discovery** — optional, complementary; requires `ENABLE_OPENAI_CONCERT_DISCOVERY=true` and `OPENAI_API_KEY`; researches the top N similar artists only
9. **OpenAI opportunity discovery** — optional, first-class semantic discovery; requires `OPENAI_BOOKING_DISCOVERY_ENABLED=true` and `OPENAI_API_KEY`; covers festivals, venues, similar-artist history, upcoming events, promoters and associations

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
| `ENABLE_MUSICBRAINZ_EVENT_HISTORY` | `true` to enable the complementary MusicBrainz concert-history venue provider (issue #182) | `false` (opt-in) |
| `BOOKING_MAX_SIMILAR_ARTISTS_FOR_VENUE_HISTORY` | Override the similar-artist count used for concert-history venue discovery | `10` |
| `BOOKING_MAX_HISTORICAL_EVENTS_PER_ARTIST` | Override the max historical events fetched per similar artist per provider | `20` |
| `BOOKING_HISTORICAL_EVENT_LOOKBACK_MONTHS` | Override how far back concert-history venue discovery looks | `24` |
| `ENABLE_TICKETMASTER_CONCERTS` | `true` to enable Ticketmaster | `false` |
| `TICKETMASTER_API_KEY` | Enables Ticketmaster Discovery API v2 | — |
| `TICKETMASTER_COUNTRY_CODE` | ISO 3166-1 alpha-2 override for location search | resolved from artist profile country, or omitted |
| `TICKETMASTER_SEARCH_RADIUS_KM` | Location search radius | `100` |
| `TICKETMASTER_EVENT_LIMIT` | Max events per genre/location query | `50` |
| `TICKETMASTER_SIMILAR_ARTIST_LIMIT` | Top-N similar artists processed | `5` |
| `TICKETMASTER_LOOKAHEAD_MONTHS` | Upcoming-event search window | `12` |
| `TICKETMASTER_PAST_LOOKBACK_MONTHS` | Best-effort past-event search window | `18` |
| `DEBUG_TICKETMASTER_CONCERTS` | `true` for detailed per-artist/per-provider Ticketmaster logs | `false` (compact summary only) |
| `ENABLE_OPENAI_CONCERT_DISCOVERY` | `true` to enable OpenAI Web Search concert discovery | `false` |
| `OPENAI_CONCERT_MODEL` | Model used for concert discovery | `gpt-4.1-mini` |
| `OPENAI_CONCERT_SIMILAR_ARTIST_LIMIT` | Max similar artists researched | `5` |
| `OPENAI_CONCERT_PAST_MONTHS` | Past search window (months) | `18` |
| `OPENAI_CONCERT_UPCOMING_MONTHS` | Upcoming search window (months) | `12` |
| `OPENAI_CONCERT_MAX_EVENTS_PER_ARTIST` | Max accepted events kept per artist | `10` |
| `OPENAI_CONCERT_CONCURRENCY` | Concurrent OpenAI calls | `1` |
| `OPENAI_BOOKING_DISCOVERY_ENABLED` | `true` to enable OpenAI first-class booking opportunity discovery | `false` |
| `OPENAI_BOOKING_DISCOVERY_MODE` | `standard`, `expanded`, or unset/`auto`; degraded provider health forces expanded mode | `auto` |
| `OPENAI_BOOKING_DISCOVERY_MODEL` | Model used for OpenAI opportunity discovery | `gpt-4.1-mini` |
| `OPENAI_BOOKING_MAX_SEARCH_CALLS` | Max specialized OpenAI discovery calls | `5` standard / `10` expanded |
| `OPENAI_BOOKING_MAX_ARTISTS` | Max similar artists included in discovery prompts | `10` |
| `OPENAI_BOOKING_MAX_CANDIDATES_PER_TYPE` | Max accepted candidates per opportunity type | `20` |

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
