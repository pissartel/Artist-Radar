// Maps Next Stage's internal genre vocabulary to Ticketmaster's broader
// classification taxonomy. Ticketmaster's own categories (Rock, Pop,
// Alternative Rock, Punk, Metal, ...) are coarser than the genres Next Stage
// compares artists with, so a specific genre maps to several Ticketmaster
// classifications, ordered from most to least specific. Not exhaustive —
// extend as new genres are supported.
export const ticketmasterGenreMappings: Record<string, string[]> = {
  "pop punk": ["Punk", "Alternative Rock", "Rock"],
  "punk rock": ["Punk", "Rock"],
  punk: ["Punk", "Rock"],
  emo: ["Alternative Rock", "Rock"],
  "emo pop": ["Alternative Rock", "Pop", "Rock"],
  easycore: ["Punk", "Metal", "Rock"],
  "skate punk": ["Punk", "Rock"],
  "melodic punk": ["Punk", "Rock"],
  "hardcore punk": ["Punk", "Rock"],
  hardcore: ["Metal", "Punk", "Rock"],
  metal: ["Metal", "Rock"],
  metalcore: ["Metal", "Rock"],
  "heavy metal": ["Metal", "Rock"],
  "indie rock": ["Alternative Rock", "Rock"],
  "alternative rock": ["Alternative Rock", "Rock"],
  "indie pop": ["Pop", "Alternative Rock"],
  "indie": ["Alternative Rock", "Rock"],
  pop: ["Pop"],
  rock: ["Rock"],
  "hip hop": ["Hip-Hop/Rap"],
  rap: ["Hip-Hop/Rap"],
  trap: ["Hip-Hop/Rap"],
  electronic: ["Dance/Electronic"],
  techno: ["Dance/Electronic"],
  house: ["Dance/Electronic"],
  folk: ["Folk"],
  chanson: ["Chanson Française", "Folk"]
};

// Classifications broad enough that matching them alone is weak evidence of
// real genre compatibility (a punk artist and a stadium pop act can both be
// tagged "Rock"). Used to keep a generic classification match from scoring
// as highly as an explicit, specific one (issue #189: "a generic Rock
// classification should have a lower relevance score than an explicit Punk
// or Alternative Rock match").
export const GENERIC_TICKETMASTER_CLASSIFICATIONS: ReadonlySet<string> = new Set(["Rock", "Pop", "Music"]);

/**
 * Returns the Ticketmaster classification names to search/filter for a
 * given Next Stage genre. Falls back to a substring match against known
 * mapping keys, then to an empty array (no confident classification —
 * callers should fall back to a plain keyword search rather than guessing
 * a classification, e.g. defaulting everything unmapped to "Rock").
 */
export function mapGenreToTicketmasterClassifications(genre: string): string[] {
  const normalized = genre.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  if (ticketmasterGenreMappings[normalized]) {
    return ticketmasterGenreMappings[normalized];
  }
  for (const [key, classifications] of Object.entries(ticketmasterGenreMappings)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return classifications;
    }
  }
  return [];
}

export function isGenericTicketmasterClassification(classification: string): boolean {
  return GENERIC_TICKETMASTER_CLASSIFICATIONS.has(classification);
}
