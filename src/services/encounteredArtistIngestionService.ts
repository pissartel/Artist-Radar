import type { BookingTarget } from "../booking/types.js";
import type { SimilarArtistConcertsResult } from "../modules/similarArtistConcerts.js";
import type { ArtistProfile, SimilarArtist } from "../schemas.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { normalizeKey } from "../utils/venueNameNormalization.js";
import type {
  ArtistObservation,
  CanonicalArtistIdentity,
  SimilarityGraphStore
} from "./artistSimilarityGraphService.js";

interface EncounteredArtist {
  identity: CanonicalArtistIdentity;
  observation: ArtistObservation;
}

export interface EncounteredArtistIngestionInput {
  store: SimilarityGraphStore;
  profile: ArtistProfile;
  similarArtists: SimilarArtist[];
  concertHistory?: SimilarArtistConcertsResult[];
  bookingTargets?: BookingTarget[];
  now?: Date;
  concurrency?: number;
}

export interface EncounteredArtistIngestionResult {
  observationsCollected: number;
  observationsPersisted: number;
  artistsResolved: number;
  failures: number;
}

export async function ingestEncounteredArtists(
  input: EncounteredArtistIngestionInput
): Promise<EncounteredArtistIngestionResult> {
  const observedAt = (input.now ?? new Date()).toISOString();
  const encountered = collectEncounteredArtists(input, observedAt);
  const result: EncounteredArtistIngestionResult = {
    observationsCollected: encountered.length,
    observationsPersisted: 0,
    artistsResolved: 0,
    failures: 0
  };

  await mapWithConcurrency(encountered, input.concurrency ?? 4, async (entry) => {
    try {
      const artistId = await input.store.resolveArtist(entry.identity);
      result.artistsResolved += 1;
      if (input.store.recordArtistObservation) {
        await input.store.recordArtistObservation(artistId, entry.observation);
        result.observationsPersisted += 1;
      }
    } catch {
      // Global knowledge is additive: one ambiguous/broken observation must
      // never make the user's opportunity search fail.
      result.failures += 1;
    }
  });
  return result;
}

function collectEncounteredArtists(
  input: EncounteredArtistIngestionInput,
  observedAt: string
): EncounteredArtist[] {
  const entries: EncounteredArtist[] = [];
  const add = (identity: CanonicalArtistIdentity, observation: Omit<ArtistObservation, "observedAt">) => {
    if (!identity.name.trim()) return;
    entries.push({ identity, observation: { ...observation, observedAt } });
  };

  add(profileIdentity(input.profile), {
    role: "analyzed_artist", sourceProvider: "artist_radar_input", confidence: input.profile.confidence,
    sourceUrl: input.profile.socialLinks.spotifyUrl ?? null,
    evidence: { genres: input.profile.genres, city: input.profile.city, country: input.profile.country }
  });

  for (const artist of input.similarArtists) {
    add(similarArtistIdentity(artist), {
      role: "similar_artist", sourceProvider: artist.source, sourceUrl: artist.url ?? artist.spotifyUrl ?? null,
      confidence: artist.confidence,
      evidence: { sources: artist.sources, bookingCategory: artist.bookingCategory, totalRelevance: artist.totalRelevance }
    });
  }

  for (const history of input.concertHistory ?? []) {
    for (const concert of [...history.pastConcerts, ...history.upcomingConcerts]) {
      add({
        name: concert.artist.name,
        spotifyId: concert.artist.spotifyId ?? history.artist.spotifyId ?? null,
        musicBrainzId: concert.artist.musicBrainzId ?? null,
        genres: history.artist.genres,
        city: history.artist.city,
        country: history.artist.country
      }, concertObservation("concert_artist", concert.sources[0]?.provider ?? "concert_history", concert.sources[0]?.url, concert.externalId, concert.name, concert.venue?.name, concert.confidence ?? 0.7));
      for (const lineupArtist of concert.lineup ?? []) {
        add({ name: lineupArtist.name }, concertObservation("lineup_artist", concert.sources[0]?.provider ?? "concert_history", concert.sources[0]?.url, lineupArtist.externalId ?? concert.externalId, concert.name, concert.venue?.name, concert.confidence ?? 0.65));
      }
    }
  }

  const similarArtistByName = new Map(input.similarArtists.map((artist) => [normalizeKey(artist.name), artist]));

  for (const target of input.bookingTargets ?? []) {
    // A venue's programming history is a distinct provenance from an
    // announced lineup: it says "this artist has played here before", not
    // "this artist is on the bill for this event". Keeping the role
    // separate (venue_history_artist) matches issue #263's requirement that
    // sharing a bill/venue must never be conflated with a similarity signal.
    if (target.category === "venue") {
      const venueName = target.venueName ?? target.name;
      const knownFromEvidence = new Set<string>();
      for (const evidence of target.venueArtistEvidence ?? []) {
        const artistName = evidence.similarArtistName?.trim();
        if (!artistName) continue;
        knownFromEvidence.add(normalizeKey(artistName));
        const matchedArtist = similarArtistByName.get(normalizeKey(artistName));
        const identity = matchedArtist ? similarArtistIdentity(matchedArtist) : { name: artistName };
        add(identity, concertObservation(
          "venue_history_artist", evidence.sourceProvider, evidence.sourceUrl,
          null, evidence.eventName ?? null, venueName, evidence.confidence,
          { eventDate: evidence.eventDate ?? null }
        ));
      }
      for (const artistName of target.lineup ?? []) {
        if (knownFromEvidence.has(normalizeKey(artistName))) continue;
        add({ name: artistName }, concertObservation(
          "venue_history_artist", target.sourceProvider ?? target.sourceType, target.sourceUrl,
          null, target.name, venueName, target.confidence,
          { genres: target.genres }
        ));
      }
      continue;
    }

    // Dedupe an artist name repeated verbatim in the same announced lineup
    // before assigning billing order, so a source glitch never splits one
    // artist into both a headliner and a support observation.
    [...new Set(target.lineup ?? [])].forEach((artistName, index) => {
      add({ name: artistName }, concertObservation(
        index === 0 ? "headliner" : "support", target.sourceProvider ?? target.sourceType, target.sourceUrl,
        target.externalEventId, target.name, target.venueName, target.confidence,
        { genres: target.genres, eventDate: target.eventDate }
      ));
    });
  }

  const seen = new Set<string>();
  return entries.filter((entry) => {
    const observation = entry.observation;
    const key = [
      entry.identity.spotifyId ?? entry.identity.musicBrainzId ?? normalizeKey(entry.identity.name),
      observation.role, observation.sourceProvider, observation.sourceUrl ?? "",
      observation.eventExternalId ?? "", observation.eventName ?? ""
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function concertObservation(
  role: ArtistObservation["role"], sourceProvider: string, sourceUrl?: string | null,
  eventExternalId?: string | null, eventName?: string | null, venueName?: string | null,
  confidence = 0.5, evidence: Record<string, unknown> = {}
): Omit<ArtistObservation, "observedAt"> {
  return { role, sourceProvider, sourceUrl, eventExternalId, eventName, venueName, confidence: clamp(confidence), evidence };
}

function profileIdentity(profile: ArtistProfile): CanonicalArtistIdentity {
  return {
    name: profile.spotifyArtistName ?? profile.artistName ?? "Unknown artist",
    spotifyId: profile.spotify?.id ?? null,
    deezerId: externalIdFromUrl(profile.socialLinks.deezerUrl, "artist"),
    genres: profile.genres, city: profile.city, country: profile.country,
    profileData: { spotify: profile.spotify, platformStats: profile.platformStats }
  };
}

function similarArtistIdentity(artist: SimilarArtist): CanonicalArtistIdentity {
  return {
    name: artist.name,
    spotifyId: artist.spotifyId ?? artist.spotify?.id ?? null,
    chartmetricId: artist.chartmetric?.metrics?.chartmetricArtistId ?? null,
    musicBrainzId: externalIdFromSources(artist.sourceUrls, "musicbrainz.org/artist/"),
    genres: artist.genres, city: artist.city, country: artist.country,
    scaleBand: artist.artistScaleBand ?? artist.artistTier,
    profileData: { spotify: artist.spotify, popularity: artist.popularity }
  };
}

function externalIdFromUrl(value: string | null | undefined, marker: string): string | null {
  if (!value) return null;
  try {
    const parts = new URL(value).pathname.split("/").filter(Boolean);
    const index = parts.findIndex((part) => part.toLowerCase() === marker);
    return index >= 0 ? parts[index + 1] ?? null : null;
  } catch { return null; }
}

function externalIdFromSources(values: string[], marker: string): string | null {
  const value = values.find((url) => url.toLowerCase().includes(marker));
  return value?.split("/").filter(Boolean).at(-1) ?? null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}
