import type { CityOpportunityStat } from "@/types";

interface TopCitiesPanelProps {
  cities: CityOpportunityStat[];
}

export default function TopCitiesPanel({ cities }: TopCitiesPanelProps) {
  return (
    <div className="bg-surface rounded-xl p-4 border border-border shadow-card">
      <h3 className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest mb-3">
        Top Cities
      </h3>
      <ul className="flex flex-col gap-3">
        {cities.map((stat) => (
          <li key={stat.city}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-foreground-secondary">{stat.city}</span>
              <span className="text-xs font-semibold text-accent-text tabular-nums">
                {stat.percentage ?? stat.opportunityCount}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/60 transition-all"
                style={{ width: `${stat.percentage ?? stat.opportunityCount}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
