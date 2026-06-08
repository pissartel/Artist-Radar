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

`searchBookingOpportunities()` deduplicates targets, scores them, preserves provider warnings and returns sorted booking opportunities.

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

Disabled by default. OpenAgenda API access currently requires authentication.

Documented configuration only:

- `ENABLE_OPENAGENDA_BOOKING=true`
- `OPENAGENDA_AGENDA_UID`
- `OPENAGENDA_API_KEY`
- optional `OPENAGENDA_BASE_URL`

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

## MCP Usage

MCP tools can help agents search, inspect and validate sources during development.

Production booking code should not depend on an MCP runtime. Production integrations should use provider interfaces backed by REST/API clients or existing internal abstractions.
