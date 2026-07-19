import type { ContactRole } from "./types.js";

/**
 * Ordered strongest-signal-first: an address like "booking@label.com" listed
 * under a "Press" heading is still booking-relevant, so booking/management
 * signals are checked before the weaker generic/press ones.
 */
const ROLE_PATTERNS: Array<{ role: ContactRole; pattern: RegExp }> = [
  { role: "BOOKING", pattern: /\b(booking|programmation|programming|booker)\b/i },
  { role: "MANAGEMENT", pattern: /\b(management|manager|mgmt|agent|agency)\b/i },
  { role: "SUBMISSIONS", pattern: /\b(submit|submission|demo|apply|application|open[\s-]?call|appel\s*à)\b/i },
  { role: "PARTNERSHIPS", pattern: /\b(partnership|partenariat|sponsor(?:ing|ship)?|collab)\b/i },
  { role: "PRESS", pattern: /\b(press|presse|media|journalist)\b/i },
  { role: "GENERAL", pattern: /\b(general|info|contact|hello|bonjour)\b/i }
];

/**
 * Classifies a contact into a booking-relevant role from its value and the
 * surrounding page/label text only. Never guesses a role from an unlabeled
 * generic address; falls back to UNKNOWN rather than assuming BOOKING.
 */
export function classifyContactRole(value: string, contextText: string): ContactRole {
  const haystack = `${value} ${contextText}`;
  for (const { role, pattern } of ROLE_PATTERNS) {
    if (pattern.test(haystack)) {
      return role;
    }
  }
  return "UNKNOWN";
}
