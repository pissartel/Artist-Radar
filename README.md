# Artist Radar

Artist Radar is a Node.js TypeScript CLI MVP that generates structured booking and promotion opportunities for music artists.

## Install

```bash
npm install
```

Create a `.env` file with:

```bash
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
RAG_RETRIEVAL_LIMIT=12
APP_USER_AGENT=ArtistRadar/0.1.0 ( https://github.com/pissartel/Artist-Radar )
LASTFM_API_KEY=your_lastfm_api_key
LASTFM_SIMILAR_LIMIT=50
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
YOUTUBE_API_KEY=your_youtube_api_key
TAVILY_API_KEY=your_tavily_api_key
EXA_API_KEY=your_exa_api_key
JINA_API_KEY=your_jina_api_key
FIRECRAWL_API_KEY=your_firecrawl_api_key
```

Last.fm, Spotify and YouTube credentials are optional. When they are missing, the CLI still runs and the artist profile is created without those audience metrics. Spotify artist followers, popularity and genres may also be unavailable for some artist requests, and Spotify Related Artists can return 403 depending on app access. Spotify is treated as a lightweight ID/search provider by default: deep enrichment, Related Artists and top-track lookups are opt-in through `ENABLE_SPOTIFY_DEEP_ENRICHMENT`, `ENABLE_SPOTIFY_RELATED_ARTISTS` and `ENABLE_SPOTIFY_TOP_TRACKS`. Last.fm is used for musical similarity. MusicBrainz is used for metadata enrichment such as country, area and tags, and every request should send a meaningful `APP_USER_AGENT`. Size estimation now combines Spotify artist metrics, Spotify top-track popularity, YouTube channel stats and MusicBrainz metadata when available, and falls back conservatively when signals conflict. Similar artists in real mode therefore combine Last.fm, Spotify search, verified manual seeds and metadata enrichment; placeholder seed data is mock-only and will not appear in real output. Set `MOCK_AI=true` to use deterministic mock Spotify, YouTube, venue and event data during local mock runs. Set `DEBUG_YOUTUBE=true` to log YouTube parsing and API status.

Stored knowledge documents (`src/knowledge`) can be chunked and embedded with OpenAI embeddings for retrieval-augmented context. `OPENAI_EMBEDDING_MODEL` selects the embedding model (defaults to `text-embedding-3-small`), and `RAG_RETRIEVAL_LIMIT` caps how many chunks `retrieveRelevantContext` returns per query (defaults to 12). Chunk ids are derived from the document id, chunk index and content hash, so re-embedding an unchanged chunk is a no-op cache hit.

Debug flags are available per provider and pipeline scope:

```bash
DEBUG_SPOTIFY=true
DEBUG_SIMILAR_ARTISTS=true
DEBUG_PROFILE=true
DEBUG_YOUTUBE=true
DEBUG_EVENTS=true
DEBUG_PIPELINE=true
DEBUG_LASTFM=true
DEBUG_MUSICBRAINZ=true
DEBUG_ARTIST_VERIFICATION=true
DEBUG_ARTIST_CONSOLIDATION=true
DEBUG_FIRECRAWL=true
DEBUG_WEB_SEARCH=true
DEBUG_SEEDS=true
EXPORT_DEBUG_EVIDENCE=false
ENABLE_SPOTIFY_DEEP_ENRICHMENT=true
ENABLE_SPOTIFY_RELATED_ARTISTS=true
ENABLE_SPOTIFY_TOP_TRACKS=true
VERIFY_SIMILAR_ARTISTS=true
VERIFY_SIMILAR_ARTISTS_LIMIT=10
CONSOLIDATE_SIMILAR_ARTISTS=true
CONSOLIDATE_SIMILAR_ARTISTS_LIMIT=20
SIMILAR_ARTISTS_OUTPUT_LIMIT=80
SIMILAR_ARTISTS_TO_VERIFY_LIMIT=40
SIMILAR_ARTISTS_PER_GROUP_LIMIT=20
ENABLE_TAVILY_SEARCH=true
ENABLE_EXA_SEARCH=false
ENABLE_JINA_READER=true
ENABLE_FIRECRAWL_CONSOLIDATION=true
WEB_SEARCH_MAX_QUERIES_PER_CANDIDATE=3
WEB_SEARCH_MAX_RESULTS_PER_QUERY=5
WEB_EXTRACT_MAX_PAGES_PER_CANDIDATE=3
WEB_PROVIDER_DAILY_BUDGET_GUARD=true
FIRECRAWL_API_KEY=your_firecrawl_api_key
```

Example:

```bash
DEBUG_SPOTIFY=true DEBUG_SIMILAR_ARTISTS=true npm run dev -- booking --artist "Fake Band" --city "Lyon" --genre "metalcore" --limit 10
```

```bash
DEBUG_LASTFM=true DEBUG_MUSICBRAINZ=true npm run dev -- booking --artist "Fake Band" --city "Lyon" --genre "metalcore" --limit 10
```

```bash
DEBUG_SIMILAR_ARTISTS=true DEBUG_SEEDS=true npm run dev -- booking --artist "Fake Band" --city "Lyon" --genre "metalcore" --limit 10
```

## Test

```bash
npm test
npm run build
```

## Run

Booking search:

```bash
npm run dev -- booking --artist "Fake Band" --city "Lyon" --genre "metalcore" --target "Auvergne-Rhone-Alpes" --limit 10
```

Promo search:

```bash
npm run dev -- promo --artist "Fake Band" --city "Lyon" --genre "metalcore" --links "https://example.com,https://soundcloud.com/example" --limit 10
```

Optional social profile flags are available on both commands:

```bash
npm run dev -- booking --artist "Fake Band" --city "Lyon" --genre "metalcore" --spotify-url "https://open.spotify.com/artist/example" --youtube-url "https://www.youtube.com/@example" --instagram-url "https://www.instagram.com/example"
```

Each command writes one JSON result and CSV files to `outputs/`:
- JSON result with `artistProfile`, grouped `similarArtists`, `venueCandidates`, `eventCandidates` and `opportunities`
- Opportunities CSV
- Similar artists CSV named `{slug}-similar-artists.csv`
- Events CSV named `{slug}-events.csv`

## Frontend

The dashboard UI is a Next.js app located in `frontend/`.

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects automatically to `/dashboard`.

The frontend is fully static and does not require a backend or any API keys.

## Notes

- Contacts must be `null` when uncertain.
- Source URLs must be `null` when uncertain.
- The CLI is intentionally thin; reusable business logic lives in `runOpportunitySearch()`.
- Spotify artist URLs are used to fetch artist name, genres, follower count and popularity when Spotify credentials are configured, with Spotify top-track popularity as a fallback when artist popularity is missing.
- Spotify is now a lightweight identification/search provider by default. Deep enrichment, related-artists lookup and top-track lookup are opt-in when you need them for a specific run.
- Last.fm provides musical similarity candidates when `LASTFM_API_KEY` is configured.
- MusicBrainz adds country, area and tag metadata for similar artist candidates when available.
- Last.fm and MusicBrainz primarily return candidate names and metadata. When `VERIFY_SIMILAR_ARTISTS=true`, `ArtistVerificationService` checks the top non-Spotify candidates against Spotify identity search and optional public web search results before adding Spotify, Instagram or YouTube links.
- `verificationStatus` explains candidate confidence: `verified` has at least one strong identity source, `needs_verification` is musically promising but weakly sourced, and `unverified` has no usable evidence.
- Genre is the primary similar-artist criterion. Locality and size only boost candidates after genre compatibility is acceptable; same-country evidence does not rescue unrelated explicit genres.
- `to_verify` contains promising candidates with incomplete genre/location/link evidence, including Last.fm discoveries that need identity or scene verification before they become booking targets.
- Last.fm may surface useful small and mid-scene artists. `LASTFM_SIMILAR_LIMIT` defaults to 50 when a Last.fm key is configured so final quality filtering, not raw provider order, decides what survives.
- `CONSOLIDATE_SIMILAR_ARTISTS=true` enables multi-source consolidation for the top promising candidates before final scoring. It can add Spotify identity, Last.fm tags/listener evidence, MusicBrainz tags/location, Instagram handles from public search results, and YouTube channel stats when a channel URL is found.
- `CONSOLIDATE_SIMILAR_ARTISTS_LIMIT` defaults to 20 and controls only how many candidates are enriched. It does not directly cap final JSON output.
- `SIMILAR_ARTISTS_OUTPUT_LIMIT` defaults to 80, `SIMILAR_ARTISTS_TO_VERIFY_LIMIT` defaults to 40, and `SIMILAR_ARTISTS_PER_GROUP_LIMIT` defaults to 20. These control final retention separately from consolidation.
- Web consolidation is provider-based so Artist Radar does not depend on one paid credit pool. Search priority is Tavily, Exa, Firecrawl, then Noop. Extraction priority is Jina Reader, Firecrawl scrape, then no extraction.
- `ENABLE_TAVILY_SEARCH=true` plus `TAVILY_API_KEY` enables Tavily search. `ENABLE_EXA_SEARCH=true` plus `EXA_API_KEY` enables Exa semantic search. `ENABLE_JINA_READER=true` enables Jina Reader extraction, with optional `JINA_API_KEY`. `ENABLE_FIRECRAWL_CONSOLIDATION=true` plus `FIRECRAWL_API_KEY` keeps Firecrawl as fallback search/extract.
- `WEB_SEARCH_MAX_QUERIES_PER_CANDIDATE`, `WEB_SEARCH_MAX_RESULTS_PER_QUERY`, `WEB_EXTRACT_MAX_PAGES_PER_CANDIDATE` and `WEB_PROVIDER_DAILY_BUDGET_GUARD` control provider spend. URLs are deduplicated before extraction, and Instagram, YouTube and Spotify pages are not extracted directly.
- `DEBUG_WEB_SEARCH=true` logs enabled providers, selected provider, queries, result counts, extraction URLs, extraction success/failure and cost-control skips without logging API keys. `DEBUG_FIRECRAWL=true` remains available for Firecrawl-specific request diagnostics.
- Final similar artist JSON is compact by default. It includes product fields such as `genres`, `city`, `country`, identity links, scores, source URLs and a summarized `popularity` object. Set `EXPORT_DEBUG_EVIDENCE=true` to include raw `genreEvidence`, `locationEvidence`, `sizeEvidence`, discarded tags and other internal scoring fields.
- Similar artist genres are cleaned to music-style genres only. Provider tags such as singer, songwriter, ukulele, language/location tags, listener-count tags and generic mood tags are kept out of default output.
- Similar artist popularity is summarized by platform in `popularity`, with an estimated level, confidence, source type and compact Instagram, YouTube, Spotify and Last.fm size signals when known. Raw size evidence is debug-only.
- Size estimation prefers YouTube, then Spotify top tracks or artist metrics when those signals are available, and keeps the lower tier when sources disagree.
- Similar artist finding is visible in the JSON result and similar artists CSV. The JSON exposes a grouped `similarArtists` object with `local_peer`, `regional_peer`, `support_target`, `reference`, `to_verify` and `unknown` arrays. The CSV stays flat. It combines verified local seed candidates, Last.fm similarity, Spotify search fallback, MusicBrainz metadata and optional candidate verification, then ranks results by genre, local relevance and booking usefulness.
- Manual seed data must be real and sourced to appear in real mode. Placeholder seed fixtures are marked `mockOnly` and are only used when `MOCK_AI=true`.
- Local peers are prioritized over mainstream references for booking usefulness. Large international references are separated from actionable peer/support targets.
- A future `WebLocalSceneProvider` will discover artists from venues, events and web search sources.
- Instagram is enrichment only. Artist Radar extracts Instagram handles from public non-Instagram venue, event, blog, local agenda, collective and association pages; direct Instagram scraping is not part of the MVP.
- Future web discovery should use Firecrawl or search providers on non-Instagram pages first, then normalize any Instagram profile links found on those source pages. Search-result Instagram URLs are normalized with `InstagramHandleExtractor`; Instagram pages are not scraped. YouTube is used for size evidence only after a channel URL is found.
- Spotify Related Artists access may be unavailable for some Spotify apps or artists. The CLI keeps that path non-fatal when it is available as a provider input.
- YouTube URLs are used to enrich the artist profile with channel subscribers, views and video count when `YOUTUBE_API_KEY` is configured.
- Instagram URLs are normalized into the artist profile, but no Instagram API, Instagram login, proxy usage, follower scraping or post scraping is used.
- Bandsintown is not used as a general event discovery API. Its API access appears limited to an artist's own data unless explicitly approved, so Artist Radar keeps event discovery behind provider abstractions for now.
