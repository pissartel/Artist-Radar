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
  services/
    openaiService.ts
    exportService.ts
    searchService.ts
    spotifyService.ts

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
3. Enrich ArtistProfile with Spotify metadata when a Spotify artist URL and credentials are available
4. Find visible similar artists and group them by size tier
5. Build prompt with ArtistInput and ArtistProfile context
6. Optionally gather search context
7. Call OpenAI
8. Normalize nullable URL fields and validate structured result
9. Return artistProfile, similarArtists, similarArtistsByTier and opportunities

## Artist Profile Collector

The profile collector prepares Artist Radar for data-driven V1 with a small Spotify metadata integration.

collectArtistProfile(input)

Responsibilities:
- Normalize CLI/API input into an ArtistProfile
- Parse Spotify, YouTube and Instagram URLs from dedicated fields
- Parse Spotify, YouTube and Instagram URLs from the generic links field
- Fetch Spotify artist name, genres, followers and popularity when credentials are configured
- Accept optional mock platform stats when provided by tests or future callers
- Estimate a basic artist level from Spotify metrics or provided stats
- Return a confidence score from 0 to 1

Current limitations:
- Spotify uses Client Credentials only and returns null when credentials are missing or the request fails
- No YouTube API integration
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
- Group similar artists with groupSimilarArtistsByTier()
- Avoid real search APIs until an explicit search provider is added
- Use null for unknown artist URLs
- Estimate artistTier from available follower and popularity metrics

Artist tiers:
- small: similar or slightly smaller than the user artist; useful for co-bills, local shows, swaps and accessible collaborations
- medium: similar or moderately bigger; useful for ambitious support slots and realistic next-step venue context
- large: much bigger; useful as references and long-term targets, not immediate co-bill opportunities
- unknown: not enough data

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
- opportunities

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
