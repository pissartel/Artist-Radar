# Artist Radar — Architecture

## Current target

The current target is a local CLI MVP.

## Future target

The future target is a SaaS product.

Therefore, the code must be structured so the core business logic can be reused by:
- CLI
- API backend
- future web app
- background jobs

## Preferred structure

src/
  cli.ts
  pipeline.ts
  schemas.ts
  prompts.ts
  modules/
    profileCollector.ts
    similarArtistsFinder.ts
    venueEventFinder.ts
  services/
    openaiService.ts
    exportService.ts
    searchService.ts
    spotifyService.ts
    youtubeService.ts

## Core principle

The CLI is only an entry point.

It should:
1. Parse command-line arguments
2. Build ArtistInput
3. Call runOpportunitySearch()
4. Export results
5. Print output paths

It should not contain product logic.

## Pipeline

runOpportunitySearch(input)

Steps:
1. Validate artist input
2. Collect a normalized ArtistProfile
3. Enrich ArtistProfile with Spotify and YouTube metadata when URLs and credentials are available
4. Find visible similar artists and group them by size tier
5. Collect mock venue and event candidates when `MOCK_AI=true`
6. Build prompt with ArtistInput and ArtistProfile context
7. Optionally gather search context
8. Call OpenAI
9. Normalize nullable URL fields and validate structured result
10. Return artistProfile, similarArtists, similarArtistsByTier, venueCandidates, eventCandidates and opportunities

## Artist Profile Collector

The profile collector prepares Artist Radar for data-driven V1 with Spotify and YouTube metadata integrations.

collectArtistProfile(input)

Responsibilities:
- Normalize CLI/API input into an ArtistProfile
- Parse Spotify, YouTube and Instagram URLs from dedicated fields
- Parse Spotify, YouTube and Instagram URLs from the generic links field
- Fetch Spotify artist name, genres, followers and popularity when credentials are configured
- Fetch YouTube channel title, subscribers, total views and video count when `YOUTUBE_API_KEY` is configured
- Accept optional mock platform stats when provided by tests or future callers
- Estimate a basic artist level from Spotify metrics or provided stats
- Return a confidence score from 0 to 1

Current limitations:
- Spotify uses Client Credentials only and returns null when credentials are missing or the request fails
- Spotify artist search returns an empty list when credentials are missing or search fails
- YouTube Data API v3 uses `YOUTUBE_API_KEY` and returns null when the key is missing or requests fail
- No Instagram API integration
- No scraping
- No persistence

## Similar Artists Finder

findSimilarArtists(input)

Responsibilities:
- Use ArtistProfile genres and city as comparison context
- Accept target context for future market-aware recommendations
- Accept genre, city and links context from ArtistInput
- Accept optional user-provided similar artist names for future callers
- Return deterministic mock similar artists across small, medium and large tiers when `MOCK_AI=true`
- Prefer Spotify Related Artists when a Spotify artist URL is available
- Fall back to Spotify artist search from profile-derived genre and market queries when related artists are unavailable
- Score candidates with genre, size and scene relevance before grouping
- Deduplicate Spotify artists and exclude the user artist
- Group similar artists with groupSimilarArtistsByTier()
- Avoid non-Spotify search APIs until an explicit search provider is added
- Use null for unknown artist URLs
- Estimate artistTier from available follower and popularity metrics

Artist tiers:
- small: similar or slightly smaller than the user artist; useful for co-bills, local shows, swaps and accessible collaborations
- medium: similar or moderately bigger; useful for ambitious support slots and realistic next-step venue context
- large: much bigger; useful as references and long-term targets, not immediate co-bill opportunities
- unknown: not enough data

Provider limitations:
- Spotify Related Artists may return 403, 404, 429 or other failures depending on app access or artist availability
- Related Artists failures do not crash the CLI; they return [] and allow fallback search
- Spotify-only results usually do not include city or country, so scene relevance is neutral or slightly penalized

## Venue And Event Finder

findVenueEventCandidates(input)

Responsibilities:
- Define EventProvider and VenueProvider interfaces for future provider integrations
- Return deterministic venueCandidates and eventCandidates in `MOCK_AI=true`
- Include small and medium venue candidates for Paris and major French cities
- Include possible support opportunities without claiming support slots are confirmed
- Keep Bandsintown out of the MVP provider stack until explicit authorization or partnership exists

Bandsintown note:
- Bandsintown API access appears limited to an artist's own data unless approved otherwise
- Artist Radar must not rely on Bandsintown as a general multi-artist event discovery API
- Bandsintown can be reconsidered only with explicit authorization, partnership, or a permitted use case

## Future SaaS reuse

Later, an API route should call the same runOpportunitySearch() function.

Possible future stack:
- Next.js frontend
- Node.js API or server actions
- Supabase/Postgres
- Stripe
- background jobs
- search/scraping providers

## Data model

ArtistInput:
- artist
- city
- genre
- target
- links
- limit
- mode
- spotifyUrl
- youtubeUrl
- instagramUrl

ArtistProfile:
- artistName
- city
- country
- genres
- spotifyArtistName
- spotifyGenres
- youtubeChannelId
- youtubeTitle
- socialLinks
- platformStats
- estimatedLevel
- confidence
- notes

SimilarArtist:
- name
- url
- genres
- city
- country
- source
- reason
- confidence
- artistTier
- estimatedFollowers
- estimatedPopularity
- relevanceToUserArtist
- possibleUse
- estimatedLevel

OpportunitySearchRunResult:
- artistProfile
- similarArtists
- similarArtistsByTier
- venueCandidates
- eventCandidates
- opportunities

EventCandidate:
- name
- date
- venueName
- city
- country
- region
- lineup
- lineupStatus
- sourceUrl
- ticketUrl
- description
- confidence

VenueCandidate:
- name
- city
- country
- type
- estimatedCapacityTier
- genres
- sourceUrl
- contact
- confidence

EstimatedArtistLevel:
- unknown
- emerging
- developing
- established

Opportunity:
- name
- type
- city
- country
- source_url
- contact
- reason
- score
- suggested_message

## Important constraints

- Do not invent contact information.
- Uncertain contact must be null.
- Uncertain source_url must be null.
- Keep outputs auditable.
