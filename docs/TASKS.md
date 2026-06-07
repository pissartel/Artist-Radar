# Artist Radar — Tasks

## Current task

Add SimilarArtists output grouped by artist size tier.

## Task 1 — Initial project

Status: done

Requirements:
- Node.js TypeScript project
- commander CLI
- zod schemas
- OpenAI service
- export service
- booking command
- promo command
- JSON and CSV export
- README
- tests
- build script

Acceptance criteria:
- npm test passes
- npm run build passes
- CLI command generates JSON and CSV files

## Task 2 — QA pass

Status: done

Requirements:
- Review code quality
- Check CLI stays thin
- Check pipeline is reusable
- Add missing tests
- Fix build/test issues

## Task 3 — Artist Profile Collector

Status: done

Requirements:
- Add ArtistProfile, SocialLinks, PlatformStats and estimated level schemas
- Add Spotify, YouTube and Instagram URL CLI flags
- Normalize dedicated social flags and generic links into ArtistProfile
- Add basic level estimation from provided mock stats only
- Include ArtistProfile in opportunity prompt context
- Add tests

Acceptance criteria:
- Existing booking and promo commands keep working
- No real platform APIs are integrated
- npm test passes
- npm run build passes

## Task 4 — Search abstraction

Status: todo

Requirements:
- Add SearchResult schema
- Add fake search provider
- Add search context support in prompt
- Add tests

## Task 5 — Real search integration

Status: later

Requirements:
- Choose provider
- Integrate provider
- Normalize results
- Improve sources and contacts

## Task 6 — API layer

Status: later

Requirements:
- Add API endpoint
- Reuse runOpportunitySearch()
- Validate inputs

## Task 7 — Spotify metadata integration

Status: done

Requirements:
- Extract Spotify artist IDs from localized and standard open.spotify.com artist URLs
- Fetch Spotify artist metadata with Client Credentials when `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are configured
- Return null instead of crashing when Spotify credentials are missing or Spotify requests fail
- Support deterministic Spotify metadata when `MOCK_AI=true`
- Enrich ArtistProfile with Spotify artist name, genres, followers and popularity
- Improve artist level estimation from Spotify popularity and followers

Acceptance criteria:
- Existing booking and promo commands keep working
- No Chartmetric integration
- No YouTube API integration
- No scraping
- npm test passes
- npm run build passes

## Task 8 — Similar Artists Finder

Status: done

Requirements:
- Add SimilarArtist schema with name, url, source, reason, confidence, genres, city and estimatedLevel
- Add src/modules/similarArtistsFinder.ts
- Use ArtistProfile genres and city plus target context
- Accept optional user-provided similar artists for future callers
- Return deterministic similar artists in `MOCK_AI=true`
- Do not use real search APIs yet
- Use null for unknown artist URLs

Acceptance criteria:
- npm test passes
- npm run build passes

## Task 9 — Similar Artists Tiered Output

Status: done

Requirements:
- Expand SimilarArtist with country, artistTier, estimated metrics, relevanceToUserArtist and possibleUse
- Implement small, medium, large and unknown tier grouping
- Add groupSimilarArtistsByTier()
- Return similarArtists and similarArtistsByTier from runOpportunitySearch()
- Include artistProfile, similarArtistsByTier and opportunities in JSON export
- Keep opportunities CSV output working
- Add a separate similar artists CSV export
- Print JSON, opportunities CSV and similar artists CSV paths from CLI
- Keep implementation mock-only for similar artists; no real search APIs

Acceptance criteria:
- Tuesday Fall-like mock profile produces visible small, medium and large similar artists
- Existing booking and promo pipeline paths keep working with injected generators
- npm test passes
- npm run build passes

## Task 10 — Spotify Similar Artists Search

Status: done

Requirements:
- Add searchSpotifyArtists(query, limit) using Spotify Web API artist search
- Return [] without crashing when Spotify credentials are missing
- Return [] and warn clearly when Spotify search fails
- Use Spotify artist search in SimilarArtistsFinder real mode
- Build genre and market queries from genre, city, target and profile genres
- Deduplicate Spotify artists and exclude the user artist
- Map Spotify artist results into SimilarArtist objects
- Keep MOCK_AI deterministic behavior

Acceptance criteria:
- Real mode can return non-empty similarArtists when Spotify search returns results
- similarArtistsByTier is computed from real-mode Spotify results
- No YouTube API, Instagram API, Chartmetric, scraping, frontend, database or auth added
- npm test passes
- npm run build passes

## Task 11 — Spotify Related Artists Provider Strategy

Status: done

Requirements:
- Add getSpotifyRelatedArtists(spotifyArtistId)
- Prefer Spotify Related Artists before search fallback
- Return [] and warn clearly when Related Artists is unavailable
- Keep Spotify lightweight by default; deep enrichment and related/top-track lookups are opt-in through environment flags
- Keep fallback search queries genre-agnostic and derived from ArtistProfile/input genres
- Add generic genre relevance, size relevance and scene relevance scoring
- Filter very low genre relevance candidates
- Keep large mainstream artists in large/reference use cases

Acceptance criteria:
- Related Artists success path is tested
- Related Artists unavailable fallback is tested
- Generic genre scoring is tested across multiple genres
- Broad rock candidates are filtered for pop punk profiles when genre relevance is weak
- npm test passes
- npm run build passes

## Task 12 — YouTube Enrichment And Event Provider Architecture

Status: done

Requirements:
- Add YouTube URL parsing for handles, channel IDs, custom URLs and user URLs
- Add getYouTubeChannelStats() using YouTube Data API v3 and `YOUTUBE_API_KEY`
- Return null without crashing when YouTube API key is missing or requests fail
- Support deterministic mock YouTube stats in `MOCK_AI=true`
- Enrich ArtistProfile with YouTube channel ID, title, subscribers, total views and video count
- Use YouTube metrics as supporting artist-level evidence
- Mix Spotify artist metrics, Spotify top-track popularity and YouTube stats in the size estimator so artists are not left `unknown` when a strong signal exists
- Add EventCandidate and VenueCandidate schemas
- Add EventProvider and VenueProvider interfaces
- Add mock venue/event candidates in `MOCK_AI=true`
- Keep Bandsintown out of the general provider stack unless explicitly authorized

Acceptance criteria:
- Existing booking and promo commands keep working
- JSON result can include venueCandidates and eventCandidates
- Opportunities and similar artists CSV exports keep working
- Events CSV export is available
- No Bandsintown, Chartmetric, Soundcharts, Viberate, scraping, frontend, database or auth added
- npm test passes
- npm run build passes
