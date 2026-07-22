import {
  getMusicBrainzUserAgent,
  scheduleMusicBrainzRequest,
  searchMusicBrainzArtistByName
} from "../../services/musicBrainzService.js";
import type { ArtistEventHistoryProvider, HistoricalArtistEvent } from "../artistEventHistory.js";

type FetchLike = typeof fetch;

export interface MusicBrainzArtistEventHistoryProviderEnv {
  ENABLE_MUSICBRAINZ_EVENT_HISTORY?: string;
  APP_USER_AGENT?: string;
}

export interface MusicBrainzArtistEventHistoryProviderOptions {
  env?: MusicBrainzArtistEventHistoryProviderEnv;
  fetchImpl?: FetchLike;
  maxEventsPerArtist?: number;
}

// Opt-in (issue #182 discussion): resolving each similar artist's MusicBrainz
// ID and then browsing its events are both serialized through the shared
// scheduleMusicBrainzRequest 1-request/second queue, so enabling this for a
// full similar-artist set adds real latency. OpenAgenda remains the default
// primary structured source; this is a complementary, opt-in addition.
export function isMusicBrainzEventHistoryEnabled(env: MusicBrainzArtistEventHistoryProviderEnv = process.env): boolean {
  return env.ENABLE_MUSICBRAINZ_EVENT_HISTORY === "true";
}

interface MusicBrainzEventRelationPlace {
  name?: string;
  area?: { name?: string | null } | null;
}

interface MusicBrainzEventRelation {
  "target-type"?: string;
  place?: MusicBrainzEventRelationPlace | null;
}

interface MusicBrainzEventApi {
  id?: string;
  name?: string;
  "life-span"?: { begin?: string | null } | null;
  relations?: MusicBrainzEventRelation[];
}

interface MusicBrainzEventBrowseResponse {
  events?: MusicBrainzEventApi[];
}

/**
 * Structured concert-history provider backed by MusicBrainz's `event` entity
 * (issue #182). MusicBrainz event/venue data is community-contributed and
 * far sparser than OpenAgenda's, so this is a complementary source, never
 * the sole one: resolves each similar artist's MBID (reusing the existing
 * searchMusicBrainzArtistByName + its per-artist memoization pattern), then
 * browses `/ws/2/event?artist=<mbid>&inc=place-rels` for events with an
 * attached venue (`place`) relation.
 */
export function buildMusicBrainzArtistEventHistoryProvider(
  options: MusicBrainzArtistEventHistoryProviderOptions = {}
): ArtistEventHistoryProvider {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxEventsPerArtist = options.maxEventsPerArtist ?? 20;
  const artistLookupCache = new Map<string, ReturnType<typeof searchMusicBrainzArtistByName>>();

  return {
    providerName: "musicbrainz_event_history",
    async findPastEvents({ artistName, artistExternalIds }) {
      if (!isMusicBrainzEventHistoryEnabled(env)) {
        return [];
      }

      const musicBrainzId = artistExternalIds?.musicbrainz
        ?? await resolveMusicBrainzId(artistName, env, fetchImpl, artistLookupCache);
      if (!musicBrainzId) {
        return [];
      }

      const response = await scheduleMusicBrainzRequest(() =>
        fetchImpl(buildEventBrowseUrl(musicBrainzId, maxEventsPerArtist), {
          headers: {
            Accept: "application/json",
            "User-Agent": getMusicBrainzUserAgent(env)
          }
        })
      );

      if (!response.ok) {
        throw new Error(`MusicBrainz event browse failed with HTTP ${response.status} for "${artistName}".`);
      }

      const body = (await response.json()) as MusicBrainzEventBrowseResponse;
      return (body.events ?? []).flatMap((event) => {
        const mapped = toHistoricalArtistEvent(event, artistName);
        return mapped ? [mapped] : [];
      });
    }
  };
}

async function resolveMusicBrainzId(
  artistName: string,
  env: MusicBrainzArtistEventHistoryProviderEnv,
  fetchImpl: FetchLike,
  cache: Map<string, ReturnType<typeof searchMusicBrainzArtistByName>>
): Promise<string | null> {
  const cacheKey = artistName.trim().toLowerCase();
  if (!cacheKey) {
    return null;
  }
  if (!cache.has(cacheKey)) {
    cache.set(cacheKey, searchMusicBrainzArtistByName(artistName, env, fetchImpl));
  }
  const metadata = await cache.get(cacheKey)!;
  return metadata?.musicBrainzId ?? null;
}

function buildEventBrowseUrl(musicBrainzId: string, limit: number): string {
  const url = new URL("https://musicbrainz.org/ws/2/event");
  url.searchParams.set("artist", musicBrainzId);
  url.searchParams.set("inc", "place-rels");
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", String(Math.max(1, Math.min(limit, 100))));
  return url.toString();
}

function toHistoricalArtistEvent(event: MusicBrainzEventApi, artistName: string): HistoricalArtistEvent | null {
  if (!event.id) {
    // No MBID for the event itself: a real, traceable source URL can't be
    // constructed, so the record must be dropped rather than left sourceless.
    return null;
  }
  const placeRelation = (event.relations ?? []).find(
    (relation) => relation["target-type"] === "place" && relation.place?.name
  );
  const venueName = placeRelation?.place?.name?.trim() || null;
  if (!venueName) {
    return null;
  }

  return {
    artistName,
    eventName: event.name ?? null,
    eventDate: event["life-span"]?.begin ?? null,
    venueName,
    // MusicBrainz's `area` on a place is often the immediate locality but can
    // also be a broader region depending on how the place was mapped; treated
    // as a best-effort city, never as a verified administrative city.
    city: placeRelation?.place?.area?.name?.trim() || null,
    // Not reliably derivable from a place's `area` alone without a deeper
    // area-hierarchy lookup; left null rather than guessed (AGENTS.md).
    country: null,
    sourceUrl: `https://musicbrainz.org/event/${event.id}`,
    sourceProvider: "musicbrainz",
    organizer: null,
    confidence: 0.55
  };
}
