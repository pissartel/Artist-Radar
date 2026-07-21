export interface OrganizerExtractionResult {
  organizerName: string | null;
  promoterName: string | null;
}

const ORGANIZER_LABEL_PATTERN = /\b(?:organis[ée] par|organized by|organizer|organisateur\s*[:\-])\s*[:\-]?\s*([^\n.|]{2,80})/i;
const PROMOTER_LABEL_PATTERN = /\b(?:promoteur|promoter|promotion\s*[:\-])\s*[:\-]?\s*([^\n.|]{2,80})/i;
const ASSOCIATION_LABEL_PATTERN = /\b(?:une (?:organisation|proposition) de|association)\s*[:\-]?\s*([^\n.|]{2,80})/i;

/**
 * Extracts an organizer/promoter name from page text via explicit labels only
 * (e.g. "Organisé par: X", "Promoter: X"); never guesses from an unlabeled
 * venue or artist name, per the "never fabricate contact information" rule.
 */
export function extractOrganizerAndPromoter(pageText: string): OrganizerExtractionResult {
  if (!pageText) {
    return { organizerName: null, promoterName: null };
  }
  const organizerMatch = pageText.match(ORGANIZER_LABEL_PATTERN) ?? pageText.match(ASSOCIATION_LABEL_PATTERN);
  const promoterMatch = pageText.match(PROMOTER_LABEL_PATTERN);
  return {
    organizerName: organizerMatch ? cleanName(organizerMatch[1]) : null,
    promoterName: promoterMatch ? cleanName(promoterMatch[1]) : null
  };
}

function cleanName(value: string): string | null {
  const trimmed = value.trim().replace(/[.,;:]+$/, "").trim();
  return trimmed.length > 0 ? trimmed : null;
}
