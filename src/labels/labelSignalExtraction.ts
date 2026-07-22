import type { SimilarArtist } from "../schemas.js";

// Requires genuine record-label evidence before classifying a result as a
// label candidate, mirroring the venue-discovery approach (issue #168): a
// bare "label" keyword ("clothing label", "private label") must never be
// enough on its own.
const EXPLICIT_LABEL_PATTERN =
  /\b(record label|independent label|label ind[ée]pendant|label discographique|netlabel|maison de disques|[ée]diteur phonographique|record company)\b/i;
const GENERIC_LABEL_KEYWORD = /\blabels?\b/i;
const LABEL_ACTIVITY_CONTEXT_PATTERN =
  /\b(roster|signed|catalogue|catalog|discograph\w*|releases?|album|ep|sorties?|sign[ée]?|distribu\w*|sorti (chez|sur)|artists?)\b/i;

const INACTIVE_LABEL_PATTERN =
  /\b(on hiatus|no longer active|ceased operations?|closed down|d[ée]funt|dissous|n'accepte plus|ferm[ée]|inactive since|discontinued|folded|plus en activit[ée])\b/i;
const RECENT_YEAR_PATTERN = /\b(20[0-9]{2})\b/g;

const DEMO_ACCEPT_PATTERN =
  /\b(accept(?:s|ing)? demos?|send (?:us )?your demos?|submit(?:ting)? (?:a |your )?demos?|d[ée]p[ôo]t de maquettes?|envoy(?:ez|er) (?:vos |votre |sa )?maquettes?|soumettre une maquette|demo submission)\b/i;
const DEMO_REJECT_PATTERN =
  /\b(do(?:es)? not accept demos?|no demos?|closed for submissions?|n'accepte pas de maquettes?|pas de d[ée]p[ôo]t de maquette)\b/i;

const LARGE_ROSTER_PATTERN = /\b(major label|multinational|global roster|worldwide roster)\b/i;
const SMALL_ROSTER_PATTERN = /\b(netlabel|diy label|bedroom label|micro-label|underground label)\b/i;

const INTERNATIONAL_OPENNESS_PATTERN =
  /\b(worldwide roster|international artists?|artists? from abroad|accept(?:s|ing)? (?:international|foreign) artists?|open to artists? (?:worldwide|internationally))\b/i;

const KNOWN_DISTRIBUTORS = [
  "Believe",
  "The Orchard",
  "IDOL",
  "PIAS",
  "Because Music",
  "Kobalt",
  "Wagram",
  "Naïve",
  "Naive",
  "InGrooves",
  "AWAL",
  "Redeye",
  "Cargo Records",
  "Broken Silence"
];

export function classifyLabelEvidence(text: string): boolean {
  if (EXPLICIT_LABEL_PATTERN.test(text)) {
    return true;
  }
  return GENERIC_LABEL_KEYWORD.test(text) && LABEL_ACTIVITY_CONTEXT_PATTERN.test(text);
}

export interface LabelActivityStatus {
  isActive: boolean | null;
  evidence: string | null;
}

// Returns isActive: false only on explicit closure/hiatus language so a
// confirmed-inactive label can be filtered out; otherwise isActive is true
// (recent year mentioned) or null ("clearly marked" as uncertain, per the
// issue's acceptance criteria) rather than guessed.
export function extractLabelActivityStatus(text: string, now: Date = new Date()): LabelActivityStatus {
  if (INACTIVE_LABEL_PATTERN.test(text)) {
    return { isActive: false, evidence: "Source text indicates the label has closed or is inactive." };
  }

  const years = [...text.matchAll(RECENT_YEAR_PATTERN)].map((match) => Number.parseInt(match[1]!, 10));
  const mostRecentYear = years.length > 0 ? Math.max(...years) : null;
  if (mostRecentYear !== null && mostRecentYear >= now.getFullYear() - 2) {
    return { isActive: true, evidence: `Source text references activity as recently as ${mostRecentYear}.` };
  }

  return { isActive: null, evidence: null };
}

export interface LabelDemoPolicy {
  acceptsDemos: boolean | null;
  demoSubmissionUrl: string | null;
}

// The demo submission link is only ever populated when acceptance is
// confirmed by text AND a matching link is present in the source's own
// links — never guessed from a generic contact page (acceptance criterion:
// demo links only displayed when supported by a public source).
export function extractLabelDemoPolicy(text: string, links: string[]): LabelDemoPolicy {
  if (DEMO_REJECT_PATTERN.test(text)) {
    return { acceptsDemos: false, demoSubmissionUrl: null };
  }
  if (DEMO_ACCEPT_PATTERN.test(text)) {
    const demoLink = links.find((link) => /demo|submit|maquette/i.test(link) && /^https?:\/\//i.test(link)) ?? null;
    return { acceptsDemos: true, demoSubmissionUrl: demoLink };
  }
  return { acceptsDemos: null, demoSubmissionUrl: null };
}

export function extractLabelDistributor(text: string): string | null {
  const normalized = text.toLowerCase();
  const match = KNOWN_DISTRIBUTORS.find((distributor) => normalized.includes(distributor.toLowerCase()));
  return match ?? null;
}

export function extractLabelRosterAudienceLevel(text: string, matchedSimilarArtists: SimilarArtist[]): "small" | "medium" | "large" | "unknown" {
  if (LARGE_ROSTER_PATTERN.test(text)) {
    return "large";
  }
  if (SMALL_ROSTER_PATTERN.test(text)) {
    return "small";
  }
  const knownTier = matchedSimilarArtists.find((artist) => artist.artistTier && artist.artistTier !== "unknown");
  return knownTier?.artistTier ?? "unknown";
}

export function isInternationallyOpen(text: string): boolean {
  return INTERNATIONAL_OPENNESS_PATTERN.test(text);
}

export function findMentionedSimilarArtists(text: string, similarArtists: SimilarArtist[]): SimilarArtist[] {
  const lower = text.toLowerCase();
  return similarArtists.filter((artist) => artist.name.trim().length > 2 && lower.includes(artist.name.trim().toLowerCase()));
}
