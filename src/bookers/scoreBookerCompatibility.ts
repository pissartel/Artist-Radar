import { matchBookingGenres } from "../booking/genreMatching.js";
import type { ArtistTier, EstimatedArtistLevel, SimilarArtist } from "../schemas.js";
import type { BookerGeographicRelevance, BookerSearchInput } from "./types.js";

// Weights follow the booking domain rule (CLAUDE.md): genre compatibility
// outweighs audience size. Represented-similar-artist connections are the
// strongest concrete evidence a booker/agency/promoter is reachable, so they
// sit just behind genre fit — mirroring the label-discovery module (#169).
const WEIGHTS = {
  genreFit: 0.3,
  representedArtistFit: 0.22,
  audienceFit: 0.15,
  geographicFit: 0.15,
  developmentStageFit: 0.1,
  submissionOpennessFit: 0.05,
  activityFit: 0.03
} as const;

const GEOGRAPHIC_SCORE: Record<BookerGeographicRelevance, number> = {
  local: 95,
  national: 80,
  remote_compatible: 70,
  international: 55,
  unknown: 45
};

const ARTIST_TIER_ORDER: ArtistTier[] = ["small", "medium", "large"];

export interface BookerCandidateSignals {
  genres: string[];
  text: string;
  matchedSimilarArtists: SimilarArtist[];
  audienceLevel: ArtistTier;
  geographicScope: BookerGeographicRelevance;
  acceptsSubmissions: boolean | null;
  isActive: boolean | null;
  hasVenueNetwork: boolean;
  worksWithEmergingActs: boolean;
}

export interface BookerCompatibilityResult {
  score: number;
  explanation: string;
}

export function scoreBookerCompatibility(input: BookerSearchInput, signals: BookerCandidateSignals): BookerCompatibilityResult {
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], signals.genres, signals.text);
  const representedArtistScore = scoreRepresentedArtistFit(signals.matchedSimilarArtists, genreMatch.level);
  const audienceScore = scoreAudienceFit(input.artistProfile?.estimatedLevel ?? "unknown", signals.audienceLevel);
  const geographicScore = GEOGRAPHIC_SCORE[signals.geographicScope];
  const developmentStageScore = scoreDevelopmentStage(signals.worksWithEmergingActs, input.artistProfile?.estimatedLevel ?? "unknown");
  const submissionScore = scoreSubmissionOpenness(signals.acceptsSubmissions);
  const activityScore = scoreActivity(signals.isActive);

  const total = clampScore(Math.round(
    genreMatch.score * WEIGHTS.genreFit +
    representedArtistScore * WEIGHTS.representedArtistFit +
    audienceScore * WEIGHTS.audienceFit +
    geographicScore * WEIGHTS.geographicFit +
    developmentStageScore * WEIGHTS.developmentStageFit +
    submissionScore * WEIGHTS.submissionOpennessFit +
    activityScore * WEIGHTS.activityFit
  ));

  return {
    score: total,
    explanation: buildExplanation({
      genreLevel: genreMatch.level,
      matchedGenres: genreMatch.matchedGenres,
      matchedSimilarArtists: signals.matchedSimilarArtists,
      geographicScope: signals.geographicScope,
      acceptsSubmissions: signals.acceptsSubmissions,
      isActive: signals.isActive,
      hasVenueNetwork: signals.hasVenueNetwork,
      worksWithEmergingActs: signals.worksWithEmergingActs
    })
  };
}

function scoreRepresentedArtistFit(matchedSimilarArtists: SimilarArtist[], genreLevel: string): number {
  if (matchedSimilarArtists.length > 0) {
    return 92;
  }
  if (genreLevel === "exact" || genreLevel === "related") {
    return 45;
  }
  return 20;
}

function scoreAudienceFit(artistLevel: EstimatedArtistLevel, bookerAudienceLevel: ArtistTier): number {
  if (bookerAudienceLevel === "unknown" || artistLevel === "unknown") {
    return 50;
  }
  const artistTier = mapEstimatedLevelToTier(artistLevel);
  const bookerIndex = ARTIST_TIER_ORDER.indexOf(bookerAudienceLevel);
  const artistIndex = ARTIST_TIER_ORDER.indexOf(artistTier);
  const distance = Math.abs(bookerIndex - artistIndex);
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

function scoreDevelopmentStage(worksWithEmergingActs: boolean, artistLevel: EstimatedArtistLevel): number {
  if (!worksWithEmergingActs) {
    return 50;
  }
  return artistLevel === "emerging" || artistLevel === "developing" ? 90 : 60;
}

function scoreSubmissionOpenness(acceptsSubmissions: boolean | null): number {
  if (acceptsSubmissions === true) return 85;
  if (acceptsSubmissions === false) return 30;
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
  geographicScope: BookerGeographicRelevance;
  acceptsSubmissions: boolean | null;
  isActive: boolean | null;
  hasVenueNetwork: boolean;
  worksWithEmergingActs: boolean;
}): string {
  const parts: string[] = [];

  parts.push(
    details.matchedGenres.length > 0
      ? `Genre fit: ${details.genreLevel} match on ${details.matchedGenres.join(", ")}.`
      : `Genre fit: ${details.genreLevel}.`
  );

  parts.push(
    details.matchedSimilarArtists.length > 0
      ? `Represents or has booked similar artist(s): ${details.matchedSimilarArtists.map((artist) => artist.name).join(", ")}.`
      : "No confirmed similar-artist representation found."
  );

  parts.push(`Geographic relevance: ${describeGeographicScope(details.geographicScope)}.`);

  if (details.worksWithEmergingActs) {
    parts.push("Evidence of working with emerging/developing artists.");
  }

  if (details.hasVenueNetwork) {
    parts.push("Evidence of an established venue network.");
  }

  if (details.acceptsSubmissions === true) {
    parts.push("Public submissions are accepted.");
  } else if (details.acceptsSubmissions === false) {
    parts.push("Submissions are not currently accepted.");
  }

  if (details.isActive === false) {
    parts.push("Activity evidence suggests this booker/agency/promoter is not currently active.");
  } else if (details.isActive === null) {
    parts.push("Current activity could not be confirmed.");
  }

  return parts.join(" ");
}

function describeGeographicScope(scope: BookerGeographicRelevance): string {
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
