import type { ContactCandidate } from "./types.js";

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function extractPublicContactSignals(text: string, links: string[] = []): ContactCandidate[] {
  const contacts: ContactCandidate[] = [];
  const uniqueEmails = uniqueStrings(text.match(EMAIL_PATTERN) ?? []);

  for (const email of uniqueEmails) {
    contacts.push({
      type: "email",
      value: email,
      sourceUrl: null,
      confidence: classifyEmailConfidence(email, text),
      notes: classifyEmailNotes(email, text)
    });
  }

  for (const link of links) {
    const normalized = link.trim();
    if (!normalized) {
      continue;
    }
    if (/contact|booking|programmation|book/i.test(normalized)) {
      contacts.push({ type: "contact_form", value: normalized, sourceUrl: normalized, confidence: 0.78, notes: "Public contact or booking link." });
    } else if (/instagram\.com|facebook\.com|linktr\.ee/i.test(normalized)) {
      contacts.push({ type: "social", value: normalized, sourceUrl: normalized, confidence: 0.45, notes: "Public social contact link." });
    }
  }

  return dedupeContacts(contacts);
}

export function pickBestContact(contacts: ContactCandidate[]): ContactCandidate | null {
  return [...contacts].sort((left, right) => right.confidence - left.confidence)[0] ?? null;
}

function classifyEmailConfidence(email: string, text: string): number {
  const label = findLabelBeforeEmail(email, text);
  if (isBookingSignal(label) || isBookingSignal(email)) {
    return 0.9;
  }
  if (isPressSignal(label) || isPressSignal(email)) {
    return 0.35;
  }
  if (isWeakOperationalSignal(label) || isWeakOperationalSignal(email)) {
    return 0.3;
  }
  const nearbyText = findNearbyText(email, text);
  if (isBookingSignal(nearbyText)) {
    return 0.9;
  }
  if (isPressSignal(nearbyText)) {
    return 0.35;
  }
  if (isWeakOperationalSignal(nearbyText)) {
    return 0.3;
  }
  return 0.6;
}

function classifyEmailNotes(email: string, text: string): string {
  const label = findLabelBeforeEmail(email, text);
  if (isBookingSignal(label) || isBookingSignal(email)) {
    return "Likely booking or programming contact.";
  }
  if (isPressSignal(label) || isPressSignal(email)) {
    return "Press-only contact signal; weaker for booking.";
  }
  if (isWeakOperationalSignal(label) || isWeakOperationalSignal(email)) {
    return "Technical or privatization contact signal; weak for booking.";
  }
  const nearbyText = findNearbyText(email, text);
  if (isBookingSignal(nearbyText)) {
    return "Likely booking or programming contact.";
  }
  if (isPressSignal(nearbyText)) {
    return "Press-only contact signal; weaker for booking.";
  }
  if (isWeakOperationalSignal(nearbyText)) {
    return "Technical or privatization contact signal; weak for booking.";
  }
  return "Public email found.";
}

function isBookingSignal(value: string): boolean {
  return /\b(booking|programming|programmation|booker|concert|live)\b/i.test(value);
}

function isPressSignal(value: string): boolean {
  return /\b(press|presse|media)\b/i.test(value);
}

function isWeakOperationalSignal(value: string): boolean {
  return /\b(technical|technique|privatisation|private event|billetterie|ticketing|tickets?)\b/i.test(value);
}

function findLabelBeforeEmail(email: string, text: string): string {
  const index = text.toLowerCase().indexOf(email.toLowerCase());
  if (index < 0) {
    return "";
  }
  return text.slice(Math.max(0, index - 28), index);
}

export function findNearbyText(value: string, text: string): string {
  const index = text.toLowerCase().indexOf(value.toLowerCase());
  if (index < 0) {
    return text;
  }
  return text.slice(Math.max(0, index - 80), Math.min(text.length, index + value.length + 80));
}

function dedupeContacts(contacts: ContactCandidate[]): ContactCandidate[] {
  const seen = new Set<string>();
  return contacts.filter((contact) => {
    const key = `${contact.type}:${contact.value ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
