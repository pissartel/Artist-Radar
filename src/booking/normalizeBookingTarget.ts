import { classifyBookingTarget } from "./classifyTarget.js";
import { extractEventDateRange } from "./dateParsing.js";
import type { BookingTarget, RawBookingSource } from "./types.js";

export function normalizeBookingSource(rawSource: RawBookingSource): BookingTarget | null {
  const sourceUrl = rawSource.sourceUrl ?? rawSource.url ?? null;
  if (!rawSource.name.trim()) {
    return null;
  }

  const target = classifyBookingTarget({
    ...rawSource,
    sourceUrl
  });

  return {
    ...target,
    sourceUrl,
    eventDateRange: rawSource.text ? extractEventDateRange(rawSource.text) : null,
    contacts: target.contacts.map((contact) => ({
      ...contact,
      sourceUrl: contact.sourceUrl ?? sourceUrl
    })),
    confidence: clampConfidence(rawSource.confidence ?? target.confidence),
    evidence: uniqueStrings([
      ...target.evidence,
      sourceUrl ? "Normalized from sourced booking provider result." : "No source URL available; keep for review only."
    ])
  };
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(value, 1));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
