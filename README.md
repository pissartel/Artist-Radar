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
```

Spotify credentials are optional. When they are missing, the CLI still runs and the artist profile is created without Spotify audience metrics. Set `MOCK_AI=true` to use deterministic mock Spotify metadata during local mock runs.

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

Each command writes one JSON result and two CSV files to `outputs/`:
- JSON result with `artistProfile`, `similarArtistsByTier` and `opportunities`
- Opportunities CSV
- Similar artists CSV named `{slug}-similar-artists.csv`

## Notes

- Contacts must be `null` when uncertain.
- Source URLs must be `null` when uncertain.
- The CLI is intentionally thin; reusable business logic lives in `runOpportunitySearch()`.
- Spotify artist URLs are used to fetch artist name, genres, follower count and popularity when Spotify credentials are configured.
- Similar artist finding is visible in the JSON result and similar artists CSV, grouped by size tier in JSON. It returns deterministic fixtures in `MOCK_AI=true` and does not call real search APIs yet.
- YouTube and Instagram URLs are normalized into the artist profile, but no YouTube or Instagram APIs or scraping are used yet.
