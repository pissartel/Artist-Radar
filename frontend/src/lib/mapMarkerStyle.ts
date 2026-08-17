import type { OpportunityType } from "@/types";

export type MapMarkerKind = "similar_artist" | OpportunityType | "fallback";

export const SIMILAR_ARTIST_COLOR = "#c084fc";

export const OPPORTUNITY_MARKER_COLORS: Record<OpportunityType, string> = {
  venue: "#3b82f6",
  concert: "#f97316",
  opening_slot: "#f43f5e",
  festival: "#eab308",
  organization: "#22c55e",
  label: "#14b8a6",
};

export const MAP_MARKER_ICONS: Record<MapMarkerKind, string> = {
  similar_artist: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3.5 18c.7-3.2 2.5-5 5.5-5s4.8 1.8 5.5 5"/><path d="M16 5v9.2a2.7 2.7 0 1 1-1.5-2.4V7l6-1.5v6.7a2.7 2.7 0 1 1-1.5-2.4V4.5z"/></svg>',
  venue: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V7l8-4 8 4v14M8 21v-4h8v4M8 10h2m4 0h2M8 14h2m4 0h2"/></svg>',
  concert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v11"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="15" r="3"/></svg>',
  festival: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18L12 5zM8 20l4-15 4 15M5.5 16h13"/></svg>',
  opening_slot: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>',
  organization: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"/></svg>',
  label: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3M3 12h3m12 0h3"/></svg>',
  fallback: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
};

export function opportunityMarkerKind(type: OpportunityType | undefined): MapMarkerKind {
  return type && type in MAP_MARKER_ICONS ? type : "fallback";
}

export function opportunityMarkerColor(type: OpportunityType | undefined): string {
  return type ? OPPORTUNITY_MARKER_COLORS[type] ?? OPPORTUNITY_MARKER_COLORS.organization : OPPORTUNITY_MARKER_COLORS.organization;
}

export function markerIconHtml(kind: MapMarkerKind, color: string, approximate = false): string {
  return `<span class="ecosystem-marker ${approximate ? "ecosystem-marker-approximate" : ""}" style="--marker-color:${color}" aria-hidden="true">${MAP_MARKER_ICONS[kind]}</span>`;
}
