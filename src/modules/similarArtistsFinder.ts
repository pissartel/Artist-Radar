import {
  SimilarArtistSchema,
  type ArtistProfile,
  type ArtistTier,
  type SimilarArtist,
  type SimilarArtistPossibleUse
} from "../schemas.js";

export interface SimilarArtistsFinderInput {
  profile: ArtistProfile;
  target?: string | null;
  genre?: string | null;
  city?: string | null;
  links?: string[];
  userProvidedSimilarArtists?: string[];
  env?: {
    MOCK_AI?: string;
  };
}

export type SimilarArtistsByTier = Record<ArtistTier, SimilarArtist[]>;

interface SimilarArtistSeed {
  name: string;
  genres: string[];
  city: string | null;
  country: string | null;
  estimatedFollowers: number | null;
  estimatedPopularity: number | null;
}

const MOCK_SIMILAR_ARTISTS: SimilarArtistSeed[] = [
  {
    name: "Mock Paris Pop Punk Peer",
    genres: ["pop punk", "emo pop"],
    city: "Paris",
    country: "France",
    estimatedFollowers: 900,
    estimatedPopularity: 14
  },
  {
    name: "Mock French Next-Step Band",
    genres: ["pop punk", "alternative rock"],
    city: "Lyon",
    country: "France",
    estimatedFollowers: 8500,
    estimatedPopularity: 32
  },
  {
    name: "Mock International Pop Punk Reference",
    genres: ["pop punk", "punk rock"],
    city: null,
    country: "France",
    estimatedFollowers: 300000,
    estimatedPopularity: 62
  }
];

export function findSimilarArtists(input: SimilarArtistsFinderInput): SimilarArtist[] {
  const env = input.env ?? process.env;
  const userProvided = normalizeUserProvidedArtists(input);

  if (env.MOCK_AI === "true") {
    return [
      ...userProvided,
      ...MOCK_SIMILAR_ARTISTS.map((artist) => buildMockSimilarArtist(artist, input))
    ].map((artist) => SimilarArtistSchema.parse(artist));
  }

  return userProvided.map((artist) => SimilarArtistSchema.parse(artist));
}

export function groupSimilarArtistsByTier(similarArtists: SimilarArtist[]): SimilarArtistsByTier {
  return similarArtists.reduce<SimilarArtistsByTier>(
    (groups, artist) => {
      groups[artist.artistTier].push(artist);
      return groups;
    },
    { small: [], medium: [], large: [], unknown: [] }
  );
}

export function determineArtistTier(
  profile: ArtistProfile,
  estimatedFollowers: number | null,
  estimatedPopularity: number | null
): ArtistTier {
  const userAudience = getProfileAudienceScore(profile);
  const candidateAudience = getAudienceScore(estimatedFollowers, estimatedPopularity);

  if (userAudience === null || candidateAudience === null) {
    return "unknown";
  }

  if (candidateAudience <= userAudience * 1.5) {
    return "small";
  }

  if (candidateAudience <= userAudience * 12) {
    return "medium";
  }

  return "large";
}

function buildMockSimilarArtist(artist: SimilarArtistSeed, input: SimilarArtistsFinderInput): SimilarArtist {
  const profileGenres = normalizeGenres(input.profile.genres);
  const requestedGenres = normalizeGenres([input.genre ?? "", ...input.profile.spotifyGenres]);
  const allContextGenres = new Set([...profileGenres, ...requestedGenres]);
  const sharedGenres = artist.genres.filter((genre) => allContextGenres.has(genre.toLowerCase()));
  const artistTier = determineArtistTier(input.profile, artist.estimatedFollowers, artist.estimatedPopularity);
  const possibleUse = possibleUseForTier(artistTier);
  const city = artist.city ?? input.city ?? input.profile.city ?? null;
  const market = input.target ?? input.city ?? input.profile.city ?? "the requested market";
  const relevanceToUserArtist =
    sharedGenres.length > 0
      ? `Shares ${sharedGenres.join(", ")} and helps map the ${market} scene.`
      : `Useful context for the ${market} scene around ${input.genre ?? input.profile.genres[0] ?? "the artist"}.`;

  return {
    name: artist.name,
    url: null,
    genres: artist.genres,
    city,
    country: artist.country,
    source: "mock",
    reason: buildReason(artistTier, possibleUse, relevanceToUserArtist, city),
    confidence: sharedGenres.length > 0 ? 0.78 : 0.58,
    artistTier,
    estimatedFollowers: artist.estimatedFollowers,
    estimatedPopularity: artist.estimatedPopularity,
    relevanceToUserArtist,
    possibleUse,
    estimatedLevel: artistTierToEstimatedLevel(artistTier)
  };
}

function normalizeUserProvidedArtists(input: SimilarArtistsFinderInput): SimilarArtist[] {
  return (input.userProvidedSimilarArtists ?? [])
    .map((artist) => artist.trim())
    .filter(Boolean)
    .map((name) => {
      const artistTier = determineArtistTier(input.profile, null, null);
      return {
        name,
        url: null,
        genres: input.profile.genres,
        city: input.city ?? input.profile.city ?? null,
        country: input.profile.country ?? null,
        source: "user",
        reason: `User-provided similar artist for comparison in ${input.target ?? input.city ?? input.profile.city ?? "the requested market"}.`,
        confidence: 0.9,
        artistTier,
        estimatedFollowers: null,
        estimatedPopularity: null,
        relevanceToUserArtist: "User-provided reference; no audience metrics are available yet.",
        possibleUse: "unknown",
        estimatedLevel: null
      };
    });
}

function possibleUseForTier(artistTier: ArtistTier): SimilarArtistPossibleUse {
  if (artistTier === "small") {
    return "co_bill";
  }

  if (artistTier === "medium") {
    return "support_target";
  }

  if (artistTier === "large") {
    return "long_term_reference";
  }

  return "unknown";
}

function artistTierToEstimatedLevel(artistTier: ArtistTier): SimilarArtist["estimatedLevel"] {
  if (artistTier === "small") {
    return "emerging";
  }

  if (artistTier === "medium") {
    return "developing";
  }

  if (artistTier === "large") {
    return "established";
  }

  return null;
}

function buildReason(
  artistTier: ArtistTier,
  possibleUse: SimilarArtistPossibleUse,
  relevanceToUserArtist: string,
  city: string | null
): string {
  const tierExplanation =
    artistTier === "small"
      ? "Similar or slightly smaller; useful for co-bills, local shows and swaps."
      : artistTier === "medium"
        ? "Moderately bigger; useful for ambitious support targets and next-step venue context."
        : artistTier === "large"
          ? "Much bigger; useful as a reference and long-term target rather than an immediate co-bill."
          : "Not enough metrics to estimate size tier.";

  return `${tierExplanation} ${relevanceToUserArtist} Possible use: ${possibleUse}.${city ? ` City: ${city}.` : ""}`;
}

function getProfileAudienceScore(profile: ArtistProfile): number | null {
  const followers = maxNullable([
    profile.platformStats.spotifyFollowers,
    profile.platformStats.youtubeSubscribers,
    profile.platformStats.instagramFollowers
  ]);
  return getAudienceScore(followers, profile.platformStats.spotifyPopularity ?? null);
}

function getAudienceScore(followers: number | null | undefined, popularity: number | null | undefined): number | null {
  const values: number[] = [];

  if (typeof followers === "number") {
    values.push(followers);
  }

  if (typeof popularity === "number") {
    values.push(popularity * 1000);
  }

  return values.length > 0 ? Math.max(...values) : null;
}

function maxNullable(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => typeof value === "number");
  return numeric.length > 0 ? Math.max(...numeric) : null;
}

function normalizeGenres(genres: string[]): string[] {
  return genres.map((genre) => genre.trim().toLowerCase()).filter(Boolean);
}
