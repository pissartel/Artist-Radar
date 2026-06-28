import type { CityOpportunityStat } from "@/types";

interface TopCitiesPanelProps {
  cities: CityOpportunityStat[];
}

export default function TopCitiesPanel({ cities }: TopCitiesPanelProps) {
  return (
    <div className="bg-card rounded-lg p-4 border border-white/5">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Top Cities
      </h3>
      <ul className="flex flex-col gap-2.5">
        {cities.map((stat) => (
          <li key={stat.city}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-300">{stat.city}</span>
              <span className="text-xs font-semibold text-accent-light">
                {stat.percentage ?? stat.opportunityCount}%
              </span>
            </div>
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent/50"
                style={{ width: `${stat.percentage ?? stat.opportunityCount}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
