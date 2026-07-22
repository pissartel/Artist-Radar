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
  ai/
    pipeline/
      types.ts
      aiPipeline.ts
      domainConfig.ts
      index.ts
  modules/
    profileCollector.ts
    similarArtistsFinder.ts
    venueEventFinder.ts
  services/
    openaiService.ts
    exportService.ts
    searchService.ts
    spotifyService.ts
    lastfmService.ts
    musicBrainzService.ts
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
10. Return artistProfile, grouped similarArtists, venueCandidates, eventCandidates and opportunities

## Artist Profile Collector

The profile collector prepares Artist Radar for data-driven V1 with Spotify and YouTube metadata integrations.

collectArtistProfile(input)

Responsibilities:
- Normalize CLI/API input into an ArtistProfile
- Parse Spotify, YouTube and Instagram URLs from dedicated fields
- Parse Spotify, YouTube and Instagram URLs from the generic links field
- Fetch Spotify artist name, genres, followers and popularity when credentials are configured
- Fetch YouTube channel title, subscribers, total views and video count when `YOUTUBE_API_KEY` is configured
- Estimate artist size from the best available platform signal, using Spotify artist metrics first, Spotify top tracks next, then YouTube as a supporting signal
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
- Combine manual seed candidates with Spotify discovery candidates
- Use Spotify Related Artists when supplied as a provider input, then fall back to Spotify artist search from profile-derived genre and market queries when related artists are unavailable
- Treat Spotify as a lightweight ID/search provider by default; deep enrichment, related-artists lookup and top-track lookup are opt-in through environment flags
- Treat Spotify followers, popularity and genres as optional, and fall back to Spotify top-track popularity when artist popularity is missing
- Use Last.fm as the first musical similarity provider when `LASTFM_API_KEY` is configured
- Use MusicBrainz to enrich candidate country, area and tag metadata when available
- Treat Last.fm and MusicBrainz as candidate-name and metadata sources first; candidate identity links are verified later
- Optionally run `ArtistVerificationService` for the top non-Spotify candidates when `VERIFY_SIMILAR_ARTISTS=true`
- Limit verification with `VERIFY_SIMILAR_ARTISTS_LIMIT`, defaulting to 10, to avoid excessive Spotify or search calls
- Verification can add Spotify URL/ID, Instagram URL/handle, YouTube URL, country/city, genre clues, evidence notes and source URLs
- `verificationStatus` is `verified`, `needs_verification` or `unverified`; weak candidates are kept in `to_verify` or `unknown` rather than promoted into actionable local/regional groups
- Candidate discovery and candidate consolidation are separate steps. Discovery finds promising names from Last.fm, MusicBrainz, Spotify, seeds and future web providers; consolidation enriches top candidates with additional evidence before final scoring.
- `ArtistConsolidationService` runs behind `CONSOLIDATE_SIMILAR_ARTISTS=true` and is limited by `CONSOLIDATE_SIMILAR_ARTISTS_LIMIT`, default 20. This limit controls enrichment calls only; it must not cap final output retention.
- Final similar artist retention is controlled separately with `SIMILAR_ARTISTS_OUTPUT_LIMIT` default 80, `SIMILAR_ARTISTS_TO_VERIFY_LIMIT` default 40 and `SIMILAR_ARTISTS_PER_GROUP_LIMIT` default 20.
- Last.fm candidates that remain musically promising, have no explicit incompatible genre evidence and score at least 30 should remain in `to_verify` even when they were not consolidated or consolidation found no extra evidence.
- Firecrawl consolidation runs only when `ENABLE_FIRECRAWL_CONSOLIDATION=true` and `FIRECRAWL_API_KEY` is present. `DEBUG_FIRECRAWL=true` logs key presence, generated queries, result counts, selected URLs and extracted evidence without exposing secrets.
- Consolidation gathers internal evidence into structured `genreEvidence`, `locationEvidence` and `sizeEvidence` arrays so scoring can explain which source supported genre, location and size assumptions.
- Final output is compact by default. `EXPORT_DEBUG_EVIDENCE=false` omits raw evidence arrays, discarded tags, snippets and internal ranking fields from JSON exports; `EXPORT_DEBUG_EVIDENCE=true` exposes them for debugging.
- Provider tags are cleaned with `GenreCleaner` before scoring and export. Default output keeps music-style genres only and discards non-genre tags such as singer, songwriter, language/location labels, listener-count labels and generic mood tags.
- Genre normalization, genre family compatibility, non-genre filtering and location/language filtering are separate concerns. The genre family map is generic and extensible across punk, metal, indie/alternative, hip hop, electronic, pop and folk families.
- Genre compatibility returns an explicit level: `exact`, `close`, `broad_weak`, `incompatible` or `unknown`. Exact matches are strongest, specific genres in the same family are close, broad parent tags are lower confidence, and unrelated explicit families are rejected.
- Broad parent tags do not rescue specific user genres unless there is close family evidence. For example, pop punk can match punk rock, emo or easycore, but not pop, rock or europop alone; metalcore can match deathcore, hardcore or metal; techno can match house or electronic but not hip hop.
- Location and language tags are filtered from genres with request context, not a single hardcoded city list. If the target is France, tags such as France, French, Paris or Lyon are removed as location/language evidence; if the target is Germany, Germany, German or Berlin can be removed the same way. Known global country/language tags such as Hungarian, Magyar and Hungary are also removed from genres.
- Size evidence is summarized into a compact `popularity` object by platform. Raw size evidence remains internal unless debug evidence export is enabled.
- Last.fm `artist.getInfo` tags become genre evidence and listeners/playcount become rough size evidence. MusicBrainz tags/location become genre and location evidence, but MusicBrainz is never used for popularity or size.
- Spotify consolidation is identity-first: exact normalized artist-name matches can add Spotify ID/URL, but Spotify popularity/followers are not treated as the main size source.
- Web search and extraction are pluggable provider interfaces. Search provider priority is Tavily, Exa, Firecrawl and Noop; extraction provider priority is Jina Reader, Firecrawl scrape and null. Firecrawl is therefore a fallback rather than the only consolidation source.
- Web provider cost controls cap queries, results and extracted pages per candidate with `WEB_SEARCH_MAX_QUERIES_PER_CANDIDATE`, `WEB_SEARCH_MAX_RESULTS_PER_QUERY` and `WEB_EXTRACT_MAX_PAGES_PER_CANDIDATE`. URLs are deduplicated before extraction, and direct Instagram, YouTube and Spotify page extraction is skipped.
- Instagram links are discovered from web/search results or public non-Instagram pages and normalized with `InstagramHandleExtractor`; Instagram pages are not scraped directly.
- YouTube channel stats are fetched only after a channel URL is found, and only when `YOUTUBE_API_KEY` is configured.
- Genre relevance is the primary scoring and filtering criterion. The booking-oriented total relevance weights are genre 55%, locality 25%, size 10% and source confidence 10%.
- A hard genre gate rejects candidates with explicit unrelated tags before locality or source confidence can compensate. Generic pop alone is not compatible with pop punk; locality must only boost genre-compatible candidates.
- Last.fm candidates with missing genre/location evidence can survive in `to_verify` when musically promising, so candidates like Broad Peak are not silently dropped before verification.
- `LASTFM_SIMILAR_LIMIT` defaults to 50 when Last.fm is configured. Optional second-degree Last.fm discovery remains off by default.
- MusicBrainz requests must send a meaningful `APP_USER_AGENT`, and the helper defaults to a safe project string when the env var is missing
- MusicBrainz calls are rate-limited and limited to a small number of candidates per run
- Prefer YouTube stats and other non-Spotify scene signals for size estimation, while keeping the output conservative when sources disagree
- Score candidates with genre, size, scene and source confidence before grouping
- Deduplicate Spotify artists and exclude the user artist
- Group similar artists with groupSimilarArtistsByTier()
- Avoid non-Spotify search APIs until an explicit search provider is added
- Use null for unknown artist URLs
- Estimate artistTier from the best available size signal: YouTube first, then Spotify artist metrics or Spotify top-track popularity, then manual seed estimates

Booking categories:
- local_peer: same city or nearby area, same or close genre, likely comparable or accessible level; useful for co-bills and local networking
- regional_peer: same country or target region, same or close genre, plausible small/medium peer; useful for scene mapping and booking research
- support_target: same or close genre, moderately bigger, active in the target country or region; useful for support slots
- reference: clearly bigger or mainstream, useful as a reference or long-term target, not an immediate booking opportunity
- unknown: not enough data

Provider limitations:
- Spotify Related Artists may return 403, 404, 429 or other failures depending on app access or artist availability
- Related Artists failures do not crash the CLI; they return [] and allow fallback search
- Spotify artist followers, popularity and genres may be unavailable; top-track popularity is used as a fallback size signal when deep enrichment is enabled
- Last.fm similar-artist lookup is optional and returns [] when `LASTFM_API_KEY` is missing
- MusicBrainz enrichment is optional and rate-limited; it is used to improve country and tag metadata, not to invent size metrics
- MusicBrainz must never be used as a size or popularity source
- Spotify-only results usually do not include city or country, so scene relevance is neutral or slightly penalized
- Similar artists should prioritize local and regional peers over generic mainstream references when the target is a local market such as France

Manual seed provider:
- Loads local seed data from `data/seeds/**`
- Seeds intended for real mode must be verified and backed by a credible source URL or social profile
- Placeholder seed fixtures are marked `mockOnly` and are only used when `MOCK_AI=true`
- Seeds are temporary MVP data that improve local and French scene coverage before web discovery exists
- Seed matching is generic and can be extended to other genres later

Future provider placeholder:
- `WebLocalSceneProvider` is reserved for venue, event and web search discovery
- It should stay behind the same provider interface so it can be added later without changing the pipeline shape
- Future web discovery should search public non-Instagram pages first: venue sites, event pages, music blogs, local agendas, collectives and associations
- The provider should discover artist names, city, genre clues, event or venue context, source URLs and Instagram links found on those source pages
- Instagram is enrichment by handle extraction only; direct Instagram scraping, login, proxies, bypass techniques, follower scraping and post scraping are not part of the MVP
- `InstagramHandleExtractor` accepts plain text or HTML from public non-Instagram pages and normalizes profile links into handles

## Venue And Event Finder

findVenueEventCandidates(input)

Responsibilities:
- Define EventProvider and VenueProvider interfaces for future provider integrations
- Return deterministic venueCandidates and eventCandidates in `MOCK_AI=true`
- Include small and medium venue candidates for Paris and major French cities
- Include possible support opportunities without claiming support slots are confirmed

Bandsintown note (updated): the prior restriction on Bandsintown as a general multi-artist event discovery API no longer applies — authorization/partnership is now in place. Bandsintown is used for exactly that purpose in "Similar Artist Concert History" below (recent past and upcoming concerts across the top-N similar artists for one analysis run). Any *other* use of Bandsintown beyond that documented feature should still be treated as requiring separate confirmation before shipping.

## Similar Artist Concert History

`findSimilarArtistConcerts(similarArtists, providers, options)` — `src/modules/similarArtistConcerts.ts`

For the top-N most compatible similar artists (by the existing `SimilarArtist.totalRelevance` ranking, 0-100), retrieves recent past and upcoming concerts from Bandsintown, Songkick and setlist.fm, normalizes and deduplicates across providers, and attaches the result to `OpportunitySearchRunResult.similarArtistConcerts` (optional; both booking and promo modes). This is general artist-analysis enrichment, not booking-opportunity generation — it produces evidence for a later scoring/matching step, not opportunities itself.

Responsibilities:
- `selectTopCompatibleSimilarArtists` sorts by `totalRelevance` descending, deterministic tiebreak by name — never a random subset. Limit: `SIMILAR_ARTISTS_CONCERT_LIMIT`, default 10.
- Only the selected top-N are queried; provider calls are bounded to 2-3 similar artists in flight at a time (`mapWithConcurrency`, `src/utils/concurrency.ts`), and every artist's provider calls run through `Promise.allSettled` so one failing provider or artist never aborts the rest.
- Each selected artist's MusicBrainz ID is resolved once (reusing `searchMusicBrainzArtistByName`, the same service already used by similar-artist enrichment elsewhere, memoized per artist name) and passed to all providers — only setlist.fm actually needs it (preferred lookup key), but resolving it once at the orchestration level keeps every provider adapter simple/stateless about identity resolution.
- Recency/result limits: `RECENT_PAST_MONTHS` (default 18), `PAST_EVENTS_PER_ARTIST` (default 10), `UPCOMING_EVENTS_PER_ARTIST` (default 10). Providers without API-side date filtering (Songkick gigography, setlist.fm) stop paginating once an event older than the cutoff is seen or a hard page cap is hit — the complete gig history is never downloaded.
- Deduplication (`dedupeArtistConcerts`) groups by (normalized artist name, calendar date) and merges when venue names normalize equal (`src/utils/venueNameNormalization.ts`: accent-stripping plus leading-article/city-suffix handling, e.g. "Le Krakatoa" / "Krakatoa" / "Krakatoa Mérignac" all resolve the same) or one side is missing a venue name and cities match. Uncertain matches (different venue, no shared city) are kept separate rather than merged incorrectly. Merging unions `sources[]` and prefers whichever side has richer venue/lineup data — never discards information or invents a missing field.
- `classifyConcertStatus` derives `past`/`upcoming` from the event date against "now" (not just trusting each provider's own signal), except an explicit `cancelled` signal always wins.
- CLI logging is gated by `DEBUG_ARTIST_CONCERTS=true` (scope `concert-history`) for the detailed per-artist/per-provider trace (found/selected artists, per-provider fetch+result counts, raw vs deduplicated counts); a compact final summary table (one line per past/upcoming concert, with merged provider names) always prints regardless of the debug flag.

Providers (`src/providers/concerts/`), each self-gated by its own env var and logged as enabled/disabled at startup:
- **Bandsintown** (`bandsintown.ts`, `BANDSINTOWN_APP_ID`) — upcoming events only. `getPastConcerts` always returns `[]`: the public API has no reliable historical archive, so no attempt is made to reconstruct one. Multi-artist use is authorized for this feature specifically (see the updated Bandsintown note above); any other use should be confirmed separately.
- **Songkick** (`songkick.ts`, `SONGKICK_API_KEY`) — resolves the artist ID via `search/artists.json` (memoized per artist name for the provider instance's lifetime), then `calendar.json` for upcoming and `gigography.json` (paginated, `order=desc`) for past.
- **setlist.fm** (`setlistfm.ts`, `SETLISTFM_API_KEY`) — past concerts only; `getUpcomingConcerts` always returns `[]` (a setlist.fm result must never be read as an upcoming booking opportunity). Prefers an artist's MusicBrainz ID (`/artist/{mbid}/setlists`); falls back to `/search/setlists?artistName=` only with a strict post-fetch check that the returned artist name actually matches — setlist.fm's search matches loosely, not by exact phrase, so a raw search hit is never trusted without verifying the artist name is actually present in the result.
- All three: missing API key, artist not found, HTTP 401/403/404/429, timeouts and malformed payloads are caught and logged (`warnLog`, scope `concert-history`) without throwing; the caller always gets `[]` for that provider/operation rather than a crash.
- No provider uses an LLM or zod for response parsing — hand-written narrow TypeScript interfaces over each provider's stable REST contract, matching the rest of the codebase's provider convention (OpenAgenda, MusicBrainz, Tavily, Firecrawl).
- **Known limitation**: no real Bandsintown/Songkick/setlist.fm API keys were available in this environment, so these three adapters are built against each provider's documented public API contract but have not been live-verified against the real APIs. Run the manual CLI test below with real keys before depending on this in production — treat any provider's "search" or fuzzy-match behavior as unverified until confirmed live, since a provider matching more loosely than its documentation implies is a realistic risk.

Manual CLI test:

```bash
DEBUG_ARTIST_CONCERTS=true \
BANDSINTOWN_APP_ID=... SONGKICK_API_KEY=... SETLISTFM_API_KEY=... \
npx tsx src/cli.ts booking --artist "Tuesday Fall" --city "Paris" --genre "pop punk" --limit 10
```

With no keys configured, each provider logs `disabled (... is missing)` at startup and the rest of the pipeline completes normally — concert-history enrichment degrades to an empty result rather than failing the run.

## Instagram Enrichment

Instagram is not a discovery provider for the MVP. Artist Radar may extract Instagram handles that appear on public venue, event, blog, local agenda, collective or association pages, but it must not fetch Instagram pages to scrape posts, followers or profiles.

Direct Instagram scraping is intentionally excluded because it is fragile, often requires login or proxies, and may violate platform terms. Future discovery should use Firecrawl or search providers against non-Instagram pages first, then pass the fetched page text or HTML to `InstagramHandleExtractor`.

`ArtistVerificationService` may also inspect public web search result URLs/snippets for Instagram profile URLs. It normalizes handles and ignores posts, reels, stories and explore links. It must not log in to Instagram, use proxies, bypass access controls or scrape follower/post data.

## Shared AI Pipeline

`src/ai/pipeline/` is a framework-free, reusable foundation so booking, similar artists, promotion and mix analysis can share the same AI research architecture instead of duplicating ad-hoc OpenAI calls.

`AiResearchDomain` identifies the feature a pipeline run belongs to: `booking`, `similar-artists`, `promotion` or `mix-analysis`.

`runAiPipeline(input, config)` in `aiPipeline.ts` orchestrates eight stages defined per domain in an `AiDomainPipelineConfig`:
1. `collectSources` — gather raw source documents
2. `normalizeDocuments` — reduce them to clean text
3. `retrieveContext` — select the relevant documents/notes for the prompt
4. `buildPrompt` — build the system/user prompt payload
5. `callModel` — call the LLM
6. `validateOutput` — validate the raw model output
7. `scoreResults` — score the validated output
8. `formatResult` — shape the final domain result

The orchestrator returns a domain-agnostic `AiPipelineResult<T>` with `result`, `sourcesUsed`, `warnings` and `generatedAt`.

`domainConfig.ts` provides a small in-memory registry (`registerAiDomainPipeline`, `getAiDomainPipeline`, `hasAiDomainPipeline`) so a domain's pipeline config can be registered once and looked up by CLI commands without importing every domain implementation module directly.

No LangChain or vector database is introduced.

### Booking RAG workflow

`src/booking/bookingAiWorkflow.ts` (`runBookingAiWorkflow`) is the first domain wired into the shared pipeline. It grounds every booking opportunity in RAG context instead of letting the model invent venues, dates, contacts or URLs:

- `collectSources` retrieves chunks from the knowledge base (`retrieveRelevantContext`) for artist/genre/venue/festival/scene queries built from the search input, merges and ranks them by similarity.
- `retrieveContext` adds a warning note when no context, or too little context, was found for the search — the model is not called at all when zero context is retrieved.
- `buildPrompt` uses `src/ai/prompts/booking-rag.prompt.ts`, which instructs the model to use only the provided context, cite evidence for every opportunity, and reject genre-incompatible results (for pop punk searches, generic rock/pop mentions without punk/emo/easycore evidence are treated as incompatible).
- `validateOutput` reuses `AiBookingOpportunitySchema`, which requires at least one evidence entry per opportunity.
- `scoreResults` drops any opportunity whose evidence URL is not among the retrieved sources (a hallucination guard), rejects genre-incompatible opportunities via `matchBookingGenres`, penalizes weak/generic genre matches, and clears any contact string that cannot be found in the cited evidence text instead of trusting it.
- `formatResult` returns the accepted opportunities, a rejected count, the deduplicated sources actually cited, and all warnings collected along the way.

A fresh pipeline config is built per call (not registered in the shared domain registry) because retrieval results for a run are held in a closure-scoped map; sharing one config across concurrent searches would leak context between them. The existing rule-based `searchBookingOpportunities()` pipeline and the booking CLI are unchanged; this RAG-grounded workflow is an additive capability for a later CLI/API wiring ticket.

### Similar artists RAG workflow

`src/similar-artists/similarArtistsAiWorkflow.ts` (`runSimilarArtistsAiWorkflow`) plugs the similar-artists domain into the same shared pipeline, mirroring the booking RAG workflow:

- The workflow takes a fixed list of already-discovered candidate artists (`SimilarArtistRagSearchInput.candidates`, e.g. from seeds, Last.fm or Spotify discovery) — the model classifies these candidates, it never invents new artist names.
- `collectSources` retrieves knowledge-base chunks (`retrieveRelevantContext`) for artist/genre/scene queries and per-candidate bio/genre/playlist/lineup/venue/co-bill queries, merges and ranks them by similarity.
- `buildPrompt` uses `src/ai/prompts/similar-artists-rag.prompt.ts`, which instructs the model to classify every given candidate — never adding or dropping any — with `genreCompatibility` (`strong`/`medium`/`weak`/`reject`), `sizeTier`, `geographicRelevance`, and a `category` (`musically_similar`, `scene_adjacent`, `commercially_useful`, `large_reference`, `rejected`).
- `validateOutput` reuses the extended `AiSimilarArtistSchema` (issue #46 added `genreCompatibility`, `geographicRelevance` and `category` to the schema originally added in issue #44), which requires a `rejectionReason` whenever `genreCompatibility` is `reject` or `category` is `rejected`, and requires evidence otherwise.
- `scoreResults` rejects any model result whose name is not in the given candidate list (a hallucination guard), drops evidence whose URL is not among the retrieved sources, re-derives the candidate's real genres/city/country/url from the original candidate metadata rather than trusting the model's restated fields, and re-grounds the model's `genreCompatibility` claim against the cited evidence text using the shared `matchBookingGenres()` helper — downgrading (never upgrading) the model's claim when the evidence doesn't support it.
- Rejected candidates (hallucinated, ungrounded, or genre-incompatible) are counted, explained in `warnings`, returned in `rejectedCandidates`, and logged via `debugLog("similar-artists", ...)`, which only prints when `DEBUG_SIMILAR_ARTISTS=true`.
- `formatResult` returns the accepted, RAG-grounded similar artists, a rejected count/list, the deduplicated sources actually cited, and all warnings collected along the way.

Like the booking workflow, this is an additive capability: the existing rule-based `findSimilarArtists()` pipeline and the CLI are unchanged.

### Deterministic scoring and AI judge pass

`src/scoring/bookingScore.ts` (`scoreBookingRelevance`) and `src/scoring/similarArtistScore.ts` (`scoreSimilarArtistRelevance`) add a code-computed relevance score on top of the RAG workflows (issue #48), grounding "how relevant is this result" in the same way the RAG prompts ground "is this result real":

- Both compute a 0-100 total from seven weighted components: genre compatibility (reusing `scoreGenreCompatibility` from issue #47), evidence quality, source recency, geographic/location relevance, artist size fit, contactability, and source confidence. `src/scoring/evidenceSignals.ts` implements the three components shared by both domains (evidence quality, recency, source confidence) so they aren't duplicated.
- The score, its component breakdown, and a human-readable explanation are attached to every accepted opportunity/similar artist as `deterministicScore`, `scoreBreakdown`, and `scoreExplanation` — always visible on the result, alongside the existing AI-provided `relevanceScore`/`similarityScore`, which this does not replace.
- `RetrievedContext` (in `retrieveRelevantContext.ts`) now also carries `createdAt` from the source knowledge chunk so `scoreRecency` has a signal to work with.

`src/ai/judge/aiJudge.ts` (`runAiJudge`) adds an optional second-pass AI reviewer over the already deterministically-scored results:

- Disabled by default; gated by `ENABLE_AI_JUDGE=true` to control API cost, and skipped entirely (no model call) when there are no items to judge.
- Built from `src/ai/prompts/judge.prompt.ts` and validated against `src/ai/schemas/judge.schema.ts` with Zod. The judge never produces or overrides a score — it only returns `relevance`, `realism`, `missingEvidence`, `risks`, and a `recommendedNextAction` per item, explaining or flagging the deterministic score rather than replacing it.
- The judge is instructed to use only the reason/evidence text it is given and not invent new sources, venues, artists, or contacts. Any verdict referencing an item name that wasn't part of the input is discarded with a warning (the same hallucination-guard pattern used elsewhere in the RAG workflows).
- Both `runBookingAiWorkflow` and `runSimilarArtistsAiWorkflow` call it once per run (batching all items into a single prompt) from their `formatResult` stage, attach the matching verdict to each result as `judgeVerdict` (`null` when disabled or unmatched), and expose `aiJudgeEnabled` on the workflow result.

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
- bookingCategory
- possibleUse
- genres
- city
- country
- spotifyUrl
- instagramUrl
- instagramHandle
- youtubeUrl
- popularity
- verificationStatus
- totalRelevance
- genreRelevance
- localRelevance
- sizeRelevance
- sources
- sourceUrls
- reason

Internal/debug SimilarArtist fields:
- url
- spotifyId
- youtubeChannelId
- youtubeSubscribers
- youtubeTotalViews
- youtubeVideoCount
- source
- confidence
- sourceConfidence
- artistTier
- estimatedFollowers
- estimatedPopularity
- topTrackPopularityMax
- topTrackPopularityAvg
- topTrackCount
- sizeSignalSource
- sceneRelevance
- relevanceToUserArtist
- estimatedLevel
- evidenceNotes
- genreEvidence
- locationEvidence
- sizeEvidence
- discardedTags
- matchedQuery
- searchRelevanceBoost

OpportunitySearchRunResult:
- artistProfile
- similarArtists grouped by local_peer, regional_peer, support_target, reference, to_verify and unknown
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
