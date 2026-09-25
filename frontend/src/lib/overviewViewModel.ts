import type { Opportunity, SimilarArtist } from "@/types";

export type OverviewKind = "venue" | "festival" | "slot" | "artist";

export function overviewKind(opportunity: Opportunity): Exclude<OverviewKind, "artist"> | null {
  if (opportunity.type === "venue") return "venue";
  if (opportunity.type === "festival") return "festival";
  if (opportunity.type === "opening_slot" || opportunity.type === "concert") return "slot";
  return null;
}

export function overviewReason(opportunity: Opportunity): string | null {
  const factor = opportunity.matchBreakdown?.positiveFactors[0];
  if (factor?.detail) return factor.detail;
  if (factor?.label) return factor.label;
  return opportunity.matchReasons.find(Boolean) ?? null;
}

export function opportunityContact(opportunity: Opportunity) {
  const structured = opportunity.contacts?.find((contact) => contact.value.trim());
  if (structured) return { label: structured.label, value: structured.value, role: structured.purpose };
  if (opportunity.contact?.trim()) return { label: "Contact", value: opportunity.contact.trim(), role: "booking" };
  return null;
}

export function rankOverviewActions(opportunities: Opportunity[], artists: SimilarArtist[]) {
  const mapped = opportunities.filter((item) => overviewKind(item));
  const dated = mapped
    .filter((item) => item.deadline && !Number.isNaN(new Date(item.deadline).getTime()) && new Date(item.deadline).getTime() >= Date.now())
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0];
  const contact = mapped
    .filter((item) => item.matchScore >= 90 && opportunityContact(item))
    .sort((a, b) => b.matchScore - a.matchScore)[0];
  const best = mapped.slice().sort((a, b) => b.matchScore - a.matchScore)[0];
  const similar = artists.slice().sort((a, b) => b.matchScore - a.matchScore)[0];
  const unique = [dated, contact, best].filter((item, index, all): item is Opportunity => Boolean(item) && all.findIndex((other) => other?.id === item.id) === index);
  return { opportunities: unique.slice(0, 3), similar: unique.length < 3 ? similar : undefined };
}

export function initials(name: string) {
  return name.split(/[\s·]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
