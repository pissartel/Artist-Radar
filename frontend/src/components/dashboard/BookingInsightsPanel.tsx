import type { BookingSource, CityOpportunityStat } from "@/types";
import TopCitiesPanel from "./TopCitiesPanel";
import MatchExplanationPanel from "./MatchExplanationPanel";
import SourcesPanel from "./SourcesPanel";
import FilterButton from "./FilterButton";

interface BookingInsightsPanelProps {
  topCities: CityOpportunityStat[];
  matchExplanations: string[];
  sources: BookingSource[];
}

export default function BookingInsightsPanel({
  topCities,
  matchExplanations,
  sources,
}: BookingInsightsPanelProps) {
  return (
    <aside className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
          Insights
        </h3>
        <FilterButton />
      </div>
      <TopCitiesPanel cities={topCities} />
      <MatchExplanationPanel explanations={matchExplanations} />
      <SourcesPanel sources={sources} />
    </aside>
  );
}
