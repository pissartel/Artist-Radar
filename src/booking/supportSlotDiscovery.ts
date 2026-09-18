import type {
  BookingTarget,
  LineupSourceAnalysis,
  LineupSourceType,
  SupportSlotDiscoveryDiagnostics,
  SupportStatus
} from "./types.js";

const TBA_PATTERN = /(?:\+\s*(?:1(?:ere|ère)|premi(?:ere|ère))\s+partie\b|\b(?:premi(?:ere|ère) partie|support|opening act|special guest|guest)\s*[:+\-]?\s*(?:tba|to be announced|à venir|a venir|à annoncer|a annoncer)\b)/i;
const INCOMPLETE_PATTERN = /\b(?:more artists? to be announced|additional guests? (?:coming soon|to be announced)|line-?up (?:soon|to be announced)|programmation à venir|la suite de la programmation (?:arrive|sera annoncée|sera annoncee)(?:\s+(?:bientôt|bientot|très vite|tres vite))?)\b/i;
const COMPLETE_PATTERN = /\b(?:full|complete|final(?:ized)?) line-?up\b|\bprogrammation (?:complète|complete|définitive|definitive)\b/i;
const NO_SUPPORT_EXPECTED_PATTERN = /\b(?:festival|dj set|one man show|spectacle assis|seated show|solo recital)\b/i;
const NAMED_BILL_PATTERN = /\b([^+\n]{2,80})\s+\+\s+([^+\n]{2,80})\b/i;
const PLACEHOLDER_PATTERN = /^(?:1(?:ere|ère)|premi(?:ere|ère)) partie|support|opening act|special guest|guest|tba|à annoncer|a annoncer$/i;

const SOURCE_PRIORITY: Record<LineupSourceType, number> = {
  venue: 5,
  promoter: 4,
  artist: 3,
  ticketing: 2,
  other: 1
};

export const DEFAULT_LINEUP_REFRESH_DAYS = {
  far: 7,
  medium: 3,
  near: 1,
  farThreshold: 90,
  nearThreshold: 30
} as const;

export interface LineupRefreshPolicy {
  far: number;
  medium: number;
  near: number;
  farThreshold: number;
  nearThreshold: number;
}

export interface SupportSlotProcessingResult {
  targets: BookingTarget[];
  diagnostics: SupportSlotDiscoveryDiagnostics;
}

export function analyzeLineupSource(input: {
  text: string;
  sourceUrl?: string | null;
  sourceType?: LineupSourceType;
  checkedAt?: Date;
  knownLineup?: string[];
  isFestival?: boolean;
}): LineupSourceAnalysis {
  const text = input.text.replace(/\s+/g, " ").trim();
  const checkedAt = (input.checkedAt ?? new Date()).toISOString();
  const sourceUrl = input.sourceUrl ?? null;
  const sourceType = input.sourceType ?? "other";
  const knownLineup = unique(input.knownLineup ?? []);
  const base = { sourceUrl, sourceType, checkedAt };

  if (input.isFestival || NO_SUPPORT_EXPECTED_PATTERN.test(text)) {
    return { ...base, supportStatus: "NO_SUPPORT_EXPECTED", supportArtists: [], lineupComplete: null, confidence: 0.95, evidence: evidenceFor(text, NO_SUPPORT_EXPECTED_PATTERN) };
  }
  if (TBA_PATTERN.test(text)) {
    return { ...base, supportStatus: "OPENING_ACT_TBA", supportArtists: [], lineupComplete: false, confidence: 0.96, evidence: evidenceFor(text, TBA_PATTERN) };
  }
  if (INCOMPLETE_PATTERN.test(text)) {
    return { ...base, supportStatus: "LINEUP_INCOMPLETE", supportArtists: [], lineupComplete: false, confidence: 0.9, evidence: evidenceFor(text, INCOMPLETE_PATTERN) };
  }
  if (COMPLETE_PATTERN.test(text)) {
    return { ...base, supportStatus: knownLineup.length > 1 ? "OPENING_ACT_CONFIRMED" : "NO_SUPPORT_EXPECTED", supportArtists: knownLineup.slice(1), lineupComplete: true, confidence: 0.9, evidence: evidenceFor(text, COMPLETE_PATTERN) };
  }

  const namedBill = text.match(NAMED_BILL_PATTERN);
  if (namedBill && !PLACEHOLDER_PATTERN.test(namedBill[2]!.trim())) {
    const supportArtists = unique([...knownLineup.slice(1), namedBill[2]!.trim()]);
    return { ...base, supportStatus: "OPENING_ACT_CONFIRMED", supportArtists, lineupComplete: null, confidence: 0.9, evidence: namedBill[0].trim().slice(0, 240) };
  }
  if (knownLineup.length > 1) {
    return { ...base, supportStatus: "OPENING_ACT_CONFIRMED", supportArtists: knownLineup.slice(1), lineupComplete: null, confidence: 0.85, evidence: `Named lineup: ${knownLineup.join(", ")}` };
  }
  if (knownLineup.length === 1 || text.length > 0) {
    return { ...base, supportStatus: "NO_SUPPORT_ANNOUNCED", supportArtists: [], lineupComplete: null, confidence: 0.58, evidence: knownLineup.length === 1 ? `Only ${knownLineup[0]} is currently listed.` : text.slice(0, 240) };
  }
  return { ...base, supportStatus: "UNKNOWN", supportArtists: [], lineupComplete: null, confidence: 0.2, evidence: "No usable lineup evidence was found." };
}

/** Resolve conflicts by authority first, then confidence and recency. Explicit TBA/incomplete evidence
 * is retained unless a more authoritative source names an opener or marks the lineup complete. */
export function reconcileLineupSources(analyses: LineupSourceAnalysis[]): LineupSourceAnalysis {
  if (analyses.length === 0) return analyzeLineupSource({ text: "" });
  return [...analyses].sort((left, right) => {
    const authority = SOURCE_PRIORITY[right.sourceType] - SOURCE_PRIORITY[left.sourceType];
    if (authority !== 0) return authority;
    if (right.confidence !== left.confidence) return right.confidence - left.confidence;
    return Date.parse(right.checkedAt) - Date.parse(left.checkedAt);
  })[0]!;
}

export function applyLineupAnalysis(target: BookingTarget, analyses: LineupSourceAnalysis[], now = new Date()): BookingTarget {
  const lineupAnalysis = reconcileLineupSources(analyses);
  const invalid = target.eventStatus === "cancelled" || target.eventStatus === "postponed" ||
    lineupAnalysis.supportStatus === "OPENING_ACT_CONFIRMED" || lineupAnalysis.supportStatus === "NO_SUPPORT_EXPECTED";
  const wording = supportOpportunityWording(lineupAnalysis.supportStatus);
  return {
    ...target,
    lineupAnalysis,
    opportunityKind: invalid ? "monitor" : target.opportunityKind,
    evidence: unique([...target.evidence, wording, `Lineup evidence (${lineupAnalysis.sourceType}, checked ${now.toISOString()}): ${lineupAnalysis.evidence}`])
  };
}

export function processSupportSlotCandidates(targets: BookingTarget[], now = new Date()): SupportSlotProcessingResult {
  const diagnostics = createSupportSlotDiagnostics(targets.filter((target) => target.category === "event" || target.category === "festival").length);
  const processed = targets.map((target) => {
    if (target.category !== "event") return target;
    diagnostics.candidateEvents += 1;
    const analysis = target.lineupAnalysis ?? analyzeLineupSource({
      text: [target.name, target.description, ...target.evidence].filter(Boolean).join(" "),
      sourceUrl: target.sourceUrl,
      sourceType: mapBookingSourceType(target.sourceType),
      checkedAt: now,
      knownLineup: target.lineup
    });
    diagnostics.deterministicExtractionHits += analysis.supportStatus === "UNKNOWN" ? 0 : 1;
    diagnostics.statusCounts[analysis.supportStatus] += 1;
    diagnostics.sourceConfidence[analysis.confidence >= 0.8 ? "high" : analysis.confidence >= 0.5 ? "medium" : "low"] += 1;
    const invalid = analysis.supportStatus === "OPENING_ACT_CONFIRMED" || analysis.supportStatus === "NO_SUPPORT_EXPECTED" || target.eventStatus === "cancelled" || target.eventStatus === "postponed";
    diagnostics.opportunitiesInvalidated += invalid ? 1 : 0;
    diagnostics.opportunitiesCreated += invalid || analysis.supportStatus === "UNKNOWN" ? 0 : 1;
    return applyLineupAnalysis(target, [analysis], now);
  });
  return { targets: processed, diagnostics };
}

export function getNextLineupRefreshAt(eventDate: string, checkedAt = new Date(), policy: LineupRefreshPolicy = DEFAULT_LINEUP_REFRESH_DAYS): Date | null {
  const eventTime = Date.parse(`${eventDate}T23:59:59Z`);
  if (!Number.isFinite(eventTime) || eventTime < checkedAt.getTime()) return null;
  const daysUntil = (eventTime - checkedAt.getTime()) / 86_400_000;
  const interval = daysUntil > policy.farThreshold ? policy.far : daysUntil >= policy.nearThreshold ? policy.medium : policy.near;
  return new Date(checkedAt.getTime() + interval * 86_400_000);
}

export function supportOpportunityWording(status: SupportStatus): string {
  if (status === "OPENING_ACT_TBA") return "Potential opening slot: a first part is announced but no artist is currently listed.";
  if (status === "LINEUP_INCOMPLETE") return "Lineup still incomplete: additional artists are expected to be announced; availability is unverified.";
  if (status === "NO_SUPPORT_ANNOUNCED") return "No support announced yet: no opening act was found on the sources checked; this does not confirm availability.";
  if (status === "OPENING_ACT_CONFIRMED") return "An opening artist is already named; this is not a normal support-slot opportunity.";
  if (status === "NO_SUPPORT_EXPECTED") return "The event format is not expected to have a normal opening slot.";
  return "Lineup status is unknown and no support-slot availability is claimed.";
}

function createSupportSlotDiagnostics(eventsDiscovered: number): SupportSlotDiscoveryDiagnostics {
  return {
    eventsDiscovered, eventsReused: 0, candidateEvents: 0, authoritativePagesResolved: 0, pagesFetched: 0,
    statusCounts: { OPENING_ACT_CONFIRMED: 0, OPENING_ACT_TBA: 0, LINEUP_INCOMPLETE: 0, NO_SUPPORT_ANNOUNCED: 0, NO_SUPPORT_EXPECTED: 0, UNKNOWN: 0 },
    opportunitiesCreated: 0, opportunitiesInvalidated: 0, deterministicExtractionHits: 0, llmFallbacks: 0, fetchFailures: 0,
    sourceConfidence: { low: 0, medium: 0, high: 0 }
  };
}

function mapBookingSourceType(type: BookingTarget["sourceType"]): LineupSourceType {
  if (type === "venue_official_programming_page") return "venue";
  if (type === "promoter_official_page") return "promoter";
  if (type === "event_page") return "ticketing";
  return "other";
}

function evidenceFor(text: string, pattern: RegExp): string {
  return text.match(pattern)?.[0]?.trim().slice(0, 240) ?? text.slice(0, 240);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
