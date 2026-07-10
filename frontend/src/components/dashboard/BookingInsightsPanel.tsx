import type { ArtistMetrics, CityOpportunityStat } from "@/types";
import TopCitiesPanel from "./TopCitiesPanel";
import ArtistMetricsPanel from "./ArtistMetricsPanel";
import FilterButton from "./FilterButton";

interface BookingInsightsPanelProps {
  metrics?: ArtistMetrics;
  topCities: CityOpportunityStat[];
  similarArtistCount: number;
  opportunityCount: number;
}

export default function BookingInsightsPanel({
  metrics,
  topCities,
  similarArtistCount,
  opportunityCount,
}: BookingInsightsPanelProps) {
  return (
    <aside className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
          Insights
        </h3>
        <FilterButton />
      </div>
      <ArtistMetricsPanel
        metrics={metrics}
        topCities={topCities}
        similarArtistCount={similarArtistCount}
        opportunityCount={opportunityCount}
      />
      <TopCitiesPanel cities={topCities} />
    </aside>
  );
}
