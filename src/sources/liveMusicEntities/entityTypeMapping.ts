import type { LiveOpportunityEntityType } from "./types.js";

export interface EntityTypeClassification {
  entityType: LiveOpportunityEntityType;
  matchedKeyword: string;
}

// Ordered by specificity: a SMAC or MJC mention must win over the generic
// "venue"/"salle" patterns below it, and a festival organizer mention must
// win over a generic "association"/"promoter" mention when both appear.
const TEXT_CLASSIFICATION_PATTERNS: Array<{ entityType: LiveOpportunityEntityType; pattern: RegExp }> = [
  { entityType: "smac", pattern: /\b(smac|salle de musiques actuelles)\b/i },
  { entityType: "mjc", pattern: /\bmjc\b|\bmaison des jeunes et de la culture\b/i },
  { entityType: "festival_organizer", pattern: /\b(festival organi[sz]er|organisateur de festival)\b/i },
  { entityType: "collective", pattern: /\b(collectif|collective)\b/i },
  { entityType: "association", pattern: /\b(association loi 1901|association culturelle|associations?)\b/i },
  {
    entityType: "promoter",
    pattern: /\b(promoteur|tourneur|programmateur|concert promoter|booking agency|agence de booking)\b/i
  },
  { entityType: "cultural_center", pattern: /\b(centre culturel|centre socioculturel|cultural cent(?:er|re))\b/i },
  { entityType: "municipal_venue", pattern: /\b(salle municipale|municipal (?:venue|hall)|salle des f[êe]tes)\b/i },
  { entityType: "third_place", pattern: /\b(tiers-?lieu|third place)\b/i },
  { entityType: "cafe_concert", pattern: /\bcaf[ée]-?concert\b/i },
  { entityType: "pub", pattern: /\bpub\b/i },
  { entityType: "bar", pattern: /\bbar\b/i },
  { entityType: "club", pattern: /\b(club|nightclub|discoth[èe]que)\b/i },
  { entityType: "concert_venue", pattern: /\b(concert venue|salle de concert|concert hall|venue|salle)\b/i }
];

/**
 * Classifies free text (page title/snippet/body) into a
 * `LiveOpportunityEntityType`. Returns null when there is no keyword
 * evidence at all, so callers never default an unrelated result to
 * "concert_venue" (acceptance criterion: never classify an ordinary place as
 * a live-music venue without supporting evidence — this only decides *which*
 * type a candidate is, qualification of *whether* it's an active opportunity
 * is handled separately by activityEvidence.ts).
 */
export function classifyLiveMusicEntityTypeFromText(text: string): EntityTypeClassification | null {
  for (const { entityType, pattern } of TEXT_CLASSIFICATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { entityType, matchedKeyword: match[0] };
    }
  }
  return null;
}

export interface OsmTags {
  amenity?: string;
  live_music?: string;
  club?: string;
  leisure?: string;
  [key: string]: string | undefined;
}

/**
 * Maps OpenStreetMap tags to a `LiveOpportunityEntityType`, per the
 * technical notes on issue #183 (amenity=music_venue as a geographic seed,
 * live_music=yes identifying bars/cafes/pubs/nightclubs with live music).
 * Returns null for tag combinations with no live-music signal at all.
 */
export function classifyLiveMusicEntityTypeFromOsmTags(tags: OsmTags): EntityTypeClassification | null {
  if (tags.amenity === "music_venue") {
    return { entityType: "concert_venue", matchedKeyword: "amenity=music_venue" };
  }

  const hasLiveMusic = tags.live_music === "yes";
  if (tags.amenity === "nightclub" || tags.club === "yes") {
    return hasLiveMusic
      ? { entityType: "club", matchedKeyword: "amenity=nightclub live_music=yes" }
      : null;
  }
  if (tags.amenity === "bar" && hasLiveMusic) {
    return { entityType: "bar", matchedKeyword: "amenity=bar live_music=yes" };
  }
  if (tags.amenity === "pub" && hasLiveMusic) {
    return { entityType: "pub", matchedKeyword: "amenity=pub live_music=yes" };
  }
  if (tags.amenity === "cafe" && hasLiveMusic) {
    return { entityType: "cafe_concert", matchedKeyword: "amenity=cafe live_music=yes" };
  }
  if (tags.amenity === "community_centre") {
    return hasLiveMusic
      ? { entityType: "cultural_center", matchedKeyword: "amenity=community_centre live_music=yes" }
      : null;
  }

  return null;
}
