import type { KpiMetric } from "@/types";

interface KpiCardProps {
  metric: KpiMetric;
}

interface IconConfig {
  color: string;
  bg: string;
  svg: React.ReactNode;
}

// Icon tint per metric follows the semantic role table in
// docs/brand/design-system.md §2 (info = venue/secondary data points,
// warning = concert/festival "event" category, success = positive/growth
// metrics, accent = match %/outreach). The brand doc doesn't define a
// dedicated 6-color data-viz palette, so two metrics share a tint here —
// flagged as a design follow-up in the PR description rather than
// inventing new off-brand hues.
const KPI_ICONS: Record<string, IconConfig> = {
  "compatible-venues": {
    color: "text-info-text",
    bg: "bg-info-tint",
    svg: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="3" width="12" height="19" rx="1" />
        <path d="M2 22h20" />
        <path d="M10 22v-5h4v5" />
        <path d="M10 8h4" />
        <path d="M10 12h4" />
      </svg>
    ),
  },
  "concerts-found": {
    color: "text-warning-text",
    bg: "bg-warning-tint",
    svg: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  "festivals": {
    color: "text-warning-text",
    bg: "bg-warning-tint",
    svg: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  "similar-artists": {
    color: "text-success-text",
    bg: "bg-success-tint",
    svg: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  "contacts-found": {
    color: "text-accent-text",
    bg: "bg-accent-tint",
    svg: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 7H4a2 2 0 0 0-2 2v6c0 1.1.9 2 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
        <circle cx="8" cy="12" r="2" />
        <path d="M14 10h4M14 14h4" />
      </svg>
    ),
  },
  "avg-match-score": {
    color: "text-accent-text",
    bg: "bg-accent-tint",
    svg: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
};

export default function KpiCard({ metric }: KpiCardProps) {
  const iconConfig = KPI_ICONS[metric.id];

  return (
    <div className="bg-surface rounded-xl p-4 border border-border shadow-card hover:bg-surface-elevated hover:border-border-accent transition-all duration-200 group">
      {iconConfig && (
        <div
          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${iconConfig.bg} ${iconConfig.color} mb-2.5`}
        >
          {iconConfig.svg}
        </div>
      )}
      <p className="text-[10px] text-foreground-muted uppercase tracking-widest mb-1 truncate">
        {metric.label}
      </p>
      <p className="text-2xl font-bold text-foreground tabular-nums">
        {metric.value}
        {metric.unit && (
          <span className="text-base text-foreground-muted ml-1">{metric.unit}</span>
        )}
      </p>
    </div>
  );
}
