import { matchBookingGenres } from "../booking/genreMatching.js";
import type { ArtistTier, EstimatedArtistLevel, SimilarArtist } from "../schemas.js";
import type { ManagementRelationshipStatus, ManagerSearchInput } from "./types.js";

export interface ManagerCandidateSignals {
  text: string;
  matchedSimilarArtists: SimilarArtist[];
  audienceLevel: ArtistTier;
  rosterSize: number;
  relationshipStatus: ManagementRelationshipStatus;
  acceptsSubmissions: boolean | null;
  isActive: boolean | null;
  worksWithEmergingArtists: boolean;
}

export function scoreManagerCompatibility(input: ManagerSearchInput, signals: ManagerCandidateSignals): { score: number; explanation: string } {
  const genre = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], [], signals.text);
  const connection = signals.matchedSimilarArtists.length >= 2 ? 100 : signals.matchedSimilarArtists.length === 1 ? 88 : 15;
  const audience = scoreAudience(input.artistProfile?.estimatedLevel ?? "unknown", signals.audienceLevel);
  const accessibility = signals.acceptsSubmissions === true ? 90 : signals.acceptsSubmissions === false ? 25 : 50;
  const rosterAccessibility = signals.rosterSize > 40 ? 25 : signals.rosterSize > 15 ? 55 : 80;
  const emerging = signals.worksWithEmergingArtists ? 90 : 50;
  const current = signals.relationshipStatus === "current" ? 90 : signals.relationshipStatus === "former" ? 35 : 50;
  const activity = signals.isActive === true ? 90 : signals.isActive === false ? 0 : 50;
  const score = Math.max(0, Math.min(100, Math.round(
    connection * .32 + genre.score * .23 + audience * .16 + rosterAccessibility * .09 + emerging * .08 + accessibility * .05 + current * .04 + activity * .03
  )));
  const match = signals.matchedSimilarArtists.map((artist) => artist.name);
  const parts = [
    match.length ? `Management connection found through similar artist(s): ${match.join(", ")}.` : "No confirmed similar-artist management connection found.",
    `Genre fit: ${genre.level}${genre.matchedGenres.length ? ` (${genre.matchedGenres.join(", ")})` : ""}.`,
    `Audience/career-stage fit: ${audience >= 80 ? "strong" : audience >= 55 ? "moderate" : "weak"}.`
  ];
  if (signals.relationshipStatus === "former") parts.push("The source describes a former, not current, management relationship.");
  if (signals.worksWithEmergingArtists) parts.push("Evidence shows work with emerging or developing artists.");
  if (signals.acceptsSubmissions === true) parts.push("A public contact or submission route is available.");
  return { score, explanation: parts.join(" ") };
}

function scoreAudience(level: EstimatedArtistLevel, tier: ArtistTier): number {
  if (level === "unknown" || tier === "unknown") return 50;
  const expected: ArtistTier = level === "emerging" ? "small" : level === "developing" ? "medium" : "large";
  const values: ArtistTier[] = ["small", "medium", "large"];
  const distance = Math.abs(values.indexOf(expected) - values.indexOf(tier));
  return distance === 0 ? 92 : distance === 1 ? 62 : 25;
}
