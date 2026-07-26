import { matchBookingGenres } from "../booking/genreMatching.js";
import type { ArtistTier, EstimatedArtistLevel, SimilarArtist } from "../schemas.js";
import type { LabelGeographicRelevance, LabelSearchInput } from "./types.js";

// Weights follow the booking domain rule (CLAUDE.md): genre compatibility
// outweighs audience size. Similar-artist connections are the strongest
// concrete evidence a label is reachable, so they sit just behind genre fit.
const WEIGHTS = {
  genreFit: 0.35,
  similarArtistFit: 0.2,
  audienceFit: 0.15,
  geographicFit: 0.15,
  demoOpennessFit: 0.1,
  activityFit: 0.05
} as const;

const GEOGRAPHIC_SCORE: Record<LabelGeographicRelevance, number> = {
  local: 95,
  national: 80,
  remote_compatible: 70,
  international: 55,
  unknown: 45
};

const ARTIST_TIER_ORDER: ArtistTier[] = ["small", "medium", "large"];

export interface LabelCandidateSignals {
  genres: string[];
  text: string;
  matchedSimilarArtists: SimilarArtist[];
  audienceLevel: ArtistTier;
  geographicScope: LabelGeographicRelevance;
  acceptsDemos: boolean | null;
  isActive: boolean | null;
  distributor: string | null;
  // Issue #195: release titles evidenced by a structured provider
  // (MusicBrainz) as actually released on this label by a matched similar
  // artist — only ever populated from stored provenance, never guessed, so
  // the explanation can name concrete releases alongside artists.
  matchedReleaseTitles?: string[];
}

export interface LabelCompatibilityResult {
  score: number;
  explanation: string;
}

export function scoreLabelCompatibility(input: LabelSearchInput, signals: LabelCandidateSignals): LabelCompatibilityResult {
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], signals.genres, signals.text);
  const similarArtistScore = scoreSimilarArtistFit(signals.matchedSimilarArtists, genreMatch.level);
  const audienceScore = scoreAudienceFit(input.artistProfile?.estimatedLevel ?? "unknown", signals.audienceLevel);
  const geographicScore = GEOGRAPHIC_SCORE[signals.geographicScope];
  const demoScore = scoreDemoOpenness(signals.acceptsDemos);
  const activityScore = scoreActivity(signals.isActive);

  const total = clampScore(Math.round(
    genreMatch.score * WEIGHTS.genreFit +
    similarArtistScore * WEIGHTS.similarArtistFit +
    audienceScore * WEIGHTS.audienceFit +
    geographicScore * WEIGHTS.geographicFit +
    demoScore * WEIGHTS.demoOpennessFit +
    activityScore * WEIGHTS.activityFit
  ));

  return {
    score: total,
    explanation: buildExplanation({
      genreLevel: genreMatch.level,
      matchedGenres: genreMatch.matchedGenres,
      matchedSimilarArtists: signals.matchedSimilarArtists,
      geographicScope: signals.geographicScope,
      acceptsDemos: signals.acceptsDemos,
      isActive: signals.isActive,
      distributor: signals.distributor,
      matchedReleaseTitles: signals.matchedReleaseTitles
    })
  };
}

function scoreSimilarArtistFit(matchedSimilarArtists: SimilarArtist[], genreLevel: string): number {
  if (matchedSimilarArtists.length > 0) {
    return 92;
  }
  if (genreLevel === "exact" || genreLevel === "related") {
    return 45;
  }
  return 20;
}

function scoreAudienceFit(artistLevel: EstimatedArtistLevel, labelAudienceLevel: ArtistTier): number {
  if (labelAudienceLevel === "unknown" || artistLevel === "unknown") {
    return 50;
  }
  const artistTier = mapEstimatedLevelToTier(artistLevel);
  const labelIndex = ARTIST_TIER_ORDER.indexOf(labelAudienceLevel);
  const artistIndex = ARTIST_TIER_ORDER.indexOf(artistTier);
  const distance = Math.abs(labelIndex - artistIndex);
  if (distance === 0) return 90;
  if (distance === 1) return 65;
  return 35;
}

function mapEstimatedLevelToTier(level: EstimatedArtistLevel): ArtistTier {
  if (level === "emerging") return "small";
  if (level === "developing") return "medium";
  if (level === "established") return "large";
  return "small";
}

function scoreDemoOpenness(acceptsDemos: boolean | null): number {
  if (acceptsDemos === true) return 85;
  if (acceptsDemos === false) return 30;
  return 55;
}

function scoreActivity(isActive: boolean | null): number {
  if (isActive === true) return 90;
  if (isActive === false) return 0;
  return 55;
}

function buildExplanation(details: {
  genreLevel: string;
  matchedGenres: string[];
  matchedSimilarArtists: SimilarArtist[];
  geographicScope: LabelGeographicRelevance;
  acceptsDemos: boolean | null;
  isActive: boolean | null;
  distributor: string | null;
  matchedReleaseTitles?: string[];
}): string {
  const parts: string[] = [];

  parts.push(
    details.matchedGenres.length > 0
      ? `Genre fit: ${details.genreLevel} match on ${details.matchedGenres.join(", ")}.`
      : `Genre fit: ${details.genreLevel}.`
  );

  parts.push(
    details.matchedSimilarArtists.length > 0
      ? `Connected to similar artist(s): ${details.matchedSimilarArtists.map((artist) => artist.name).join(", ")}.`
      : "No confirmed similar-artist connection found."
  );

  if (details.matchedReleaseTitles && details.matchedReleaseTitles.length > 0) {
    parts.push(`Evidenced by release(s): ${details.matchedReleaseTitles.join(", ")}.`);
  }

  parts.push(`Geographic relevance: ${describeGeographicScope(details.geographicScope)}.`);

  if (details.acceptsDemos === true) {
    parts.push("Demo submissions are accepted.");
  } else if (details.acceptsDemos === false) {
    parts.push("Demo submissions are not currently accepted.");
  }

  if (details.isActive === false) {
    parts.push("Activity evidence suggests this label is not currently active.");
  } else if (details.isActive === null) {
    parts.push("Current activity could not be confirmed.");
  }

  if (details.distributor) {
    parts.push(`Distributed via ${details.distributor}.`);
  }

  return parts.join(" ");
}

function describeGeographicScope(scope: LabelGeographicRelevance): string {
  switch (scope) {
    case "local": return "local to the artist";
    case "national": return "national";
    case "remote_compatible": return "international but open to remote/foreign artists";
    case "international": return "international";
    default: return "unknown";
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(value, 100));
}
