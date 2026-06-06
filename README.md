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
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
YOUTUBE_API_KEY=your_youtube_api_key
```

Spotify and YouTube credentials are optional. When they are missing, the CLI still runs and the artist profile is created without those audience metrics. Similar artists in real mode require Spotify credentials; without them, `similarArtists` may be empty. Set `MOCK_AI=true` to use deterministic mock Spotify, YouTube, venue and event data during local mock runs. Set `DEBUG_YOUTUBE=true` to log YouTube parsing and API status.

Debug flags are available per provider and pipeline scope:

```bash
DEBUG_SPOTIFY=true
DEBUG_SIMILAR_ARTISTS=true
DEBUG_PROFILE=true
DEBUG_YOUTUBE=true
DEBUG_EVENTS=true
DEBUG_PIPELINE=true
```

Example:

```bash
DEBUG_SPOTIFY=true DEBUG_SIMILAR_ARTISTS=true npm run dev -- booking --artist "Fake Band" --city "Lyon" --genre "metalcore" --limit 10
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
- JSON result with `artistProfile`, `similarArtistsByTier`, `venueCandidates`, `eventCandidates` and `opportunities`
- Opportunities CSV
- Similar artists CSV named `{slug}-similar-artists.csv`
- Events CSV named `{slug}-events.csv`

## Notes

- Contacts must be `null` when uncertain.
- Source URLs must be `null` when uncertain.
- The CLI is intentionally thin; reusable business logic lives in `runOpportunitySearch()`.
- Spotify artist URLs are used to fetch artist name, genres, follower count and popularity when Spotify credentials are configured.
- Similar artist finding is visible in the JSON result and similar artists CSV, grouped by size tier in JSON. It tries Spotify Related Artists first, falls back to Spotify artist search when related artists are unavailable, and ranks candidates by genre, size and scene relevance.
- Spotify Related Artists access may be unavailable for some Spotify apps or artists. In that case the CLI logs a warning and continues with fallback search when credentials are configured.
- YouTube URLs are used to enrich the artist profile with channel subscribers, views and video count when `YOUTUBE_API_KEY` is configured.
- Instagram URLs are normalized into the artist profile, but no Instagram API or scraping is used yet.
- Bandsintown is not used as a general event discovery API. Its API access appears limited to an artist's own data unless explicitly approved, so Artist Radar keeps event discovery behind provider abstractions for now.
