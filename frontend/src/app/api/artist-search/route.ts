import * as deezerRuntime from "../../../../../dist/services/deezerService.js";
import * as musicBrainzRuntime from "../../../../../dist/services/musicBrainzService.js";
import * as spotifyRuntime from "../../../../../dist/services/spotifyService.js";

interface SpotifyArtist {
  id: string;
  name: string;
  followers: number | null;
  genres: string[];
  spotifyUrl: string | null;
  images: string[];
}

interface DeezerArtist {
  id: number;
  name: string;
  fans: number | null;
  deezerUrl: string | null;
  imageUrl: string | null;
}

interface MusicBrainzArtist {
  musicBrainzId: string;
  name: string;
  country: string | null;
  area: string | null;
  beginArea: string | null;
  tags: string[];
  sourceUrl: string | null;
  score: number | null;
}

interface ArtistSearchCandidate {
  id: string;
  name: string;
  genres: string[];
  city: string | null;
  country: string | null;
  followers: number | null;
  imageUrl: string | null;
  spotifyUrl: string | null;
  deezerUrl: string | null;
  sources: string[];
  bestMatch: boolean;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) {
    return Response.json({ error: "Enter an artist name." }, { status: 400 });
  }

  const [spotify, deezer, musicBrainz] = await Promise.all([
    (spotifyRuntime.searchSpotifyArtists as (
      query: string,
      limit: number,
      env: NodeJS.ProcessEnv
    ) => Promise<SpotifyArtist[]>)(query, 5, process.env).catch(() => []),
    (deezerRuntime.searchDeezerArtistByName as (
      query: string,
      env: NodeJS.ProcessEnv
    ) => Promise<DeezerArtist | null>)(query, process.env).catch(() => null),
    (musicBrainzRuntime.enrichArtistWithMusicBrainz as (
      query: string,
      env: NodeJS.ProcessEnv
    ) => Promise<MusicBrainzArtist | null>)(query, process.env).catch(() => null),
  ]);

  const candidates: ArtistSearchCandidate[] = spotify.map((artist, index) => ({
    id: `spotify:${artist.id}`,
    name: artist.name,
    genres: artist.genres,
    city: null,
    country: null,
    followers: artist.followers,
    imageUrl: artist.images[0] ?? null,
    spotifyUrl: artist.spotifyUrl,
    deezerUrl: null,
    sources: ["spotify"],
    bestMatch: index === 0,
  }));

  const exactCandidate = candidates.find(
    (candidate) => normalize(candidate.name) === normalize(query)
  );

  if (deezer) {
    const candidate = candidates.find(
      (item) => normalize(item.name) === normalize(deezer.name)
    );
    if (candidate) {
      candidate.sources.push("deezer");
      candidate.deezerUrl = deezer.deezerUrl;
      candidate.imageUrl ??= deezer.imageUrl;
      candidate.followers ??= deezer.fans;
    } else {
      candidates.push({
        id: `deezer:${deezer.id}`,
        name: deezer.name,
        genres: [],
        city: null,
        country: null,
        followers: deezer.fans,
        imageUrl: deezer.imageUrl,
        spotifyUrl: null,
        deezerUrl: deezer.deezerUrl,
        sources: ["deezer"],
        bestMatch: candidates.length === 0,
      });
    }
  }

  if (musicBrainz) {
    const candidate = candidates.find(
      (item) => normalize(item.name) === normalize(musicBrainz.name)
    );
    if (candidate) {
      candidate.sources.push("musicbrainz");
      candidate.city ??= musicBrainz.beginArea ?? musicBrainz.area;
      candidate.country ??= musicBrainz.country;
      if (candidate.genres.length === 0) candidate.genres = musicBrainz.tags;
    } else {
      candidates.push({
        id: `musicbrainz:${musicBrainz.musicBrainzId}`,
        name: musicBrainz.name,
        genres: musicBrainz.tags,
        city: musicBrainz.beginArea ?? musicBrainz.area,
        country: musicBrainz.country,
        followers: null,
        imageUrl: null,
        spotifyUrl: null,
        deezerUrl: null,
        sources: ["musicbrainz"],
        bestMatch: candidates.length === 0 && (musicBrainz.score ?? 0) >= 90,
      });
    }
  }

  if (exactCandidate) exactCandidate.bestMatch = true;
  return Response.json({ candidates });
}
