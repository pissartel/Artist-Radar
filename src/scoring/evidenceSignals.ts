/**
 * Shared deterministic scoring signals reused by both booking and similar
 * artist scoring (issue #48): evidence quality, source recency, and source
 * confidence all depend only on the evidence/context shape, not on the
 * domain, so they live here instead of being duplicated per domain module.
 */

const DEFAULT_EVIDENCE_CONFIDENCE = 0.6;

/** Recency/confidence/type context resolved from the retrieved knowledge chunk behind a piece of evidence. */
export interface EvidenceSignal {
  sourceUrl: string | null;
  snippet?: string | null;
  confidence?: number;
  createdAt?: string | null;
  sourceType?: string | null;
}

const HIGH_CONFIDENCE_SOURCE_TYPES = new Set([
  "official_site",
  "venue_official_programming_page",
  "festival_official_page",
  "promoter_official_page",
  "artist"
]);

const MEDIUM_CONFIDENCE_SOURCE_TYPES = new Set([
  "event_page",
  "local_agenda",
  "festival_page",
  "open_call_page",
  "openagenda",
  "specialized_scene_agenda",
  "agenda",
  "festival",
  "venue",
  "promoter"
]);

const LOW_CONFIDENCE_SOURCE_TYPES = new Set(["social_profile", "search_result", "blog", "unknown"]);

export function scoreEvidenceQuality(evidence: EvidenceSignal[]): number {
  if (evidence.length === 0) {
    return 0;
  }

  const avgConfidence = average(evidence.map((item) => item.confidence ?? DEFAULT_EVIDENCE_CONFIDENCE));
  const snippetRatio = evidence.filter((item) => Boolean(item.snippet)).length / evidence.length;
  const countBonus = Math.min(evidence.length, 3) / 3;

  return clampScore(Math.round(avgConfidence * 100 * 0.5 + snippetRatio * 100 * 0.3 + countBonus * 100 * 0.2));
}

export function scoreRecency(evidence: EvidenceSignal[], now: Date = new Date()): number {
  const knownDates = evidence.map((item) => item.createdAt).filter((value): value is string => Boolean(value));
  if (knownDates.length === 0) {
    return 50;
  }

  const scores = knownDates.map((iso) => recencyScoreForDate(iso, now));
  return clampScore(Math.round(Math.max(...scores)));
}

export function scoreSourceConfidence(evidence: EvidenceSignal[]): number {
  if (evidence.length === 0) {
    return 0;
  }

  const perEvidenceScores = evidence.map((item) => {
    const sourceType = item.sourceType?.trim().toLowerCase();
    if (sourceType && HIGH_CONFIDENCE_SOURCE_TYPES.has(sourceType)) {
      return 90;
    }
    if (sourceType && MEDIUM_CONFIDENCE_SOURCE_TYPES.has(sourceType)) {
      return 75;
    }
    if (sourceType && LOW_CONFIDENCE_SOURCE_TYPES.has(sourceType)) {
      return 55;
    }
    return Math.round((item.confidence ?? DEFAULT_EVIDENCE_CONFIDENCE) * 100);
  });

  return clampScore(Math.round(average(perEvidenceScores)));
}

function recencyScoreForDate(iso: string, now: Date): number {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return 50;
  }

  const daysAgo = (now.getTime() - parsed) / (1000 * 60 * 60 * 24);
  if (daysAgo <= 30) return 100;
  if (daysAgo <= 90) return 85;
  if (daysAgo <= 180) return 70;
  if (daysAgo <= 365) return 50;
  if (daysAgo <= 730) return 30;
  return 15;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(value, 100));
}
