import type { ArtistMetrics, BookingSource, CityOpportunityStat } from "@/types";
import TopCitiesPanel from "./TopCitiesPanel";
import ArtistMetricsPanel from "./ArtistMetricsPanel";
import SourcesPanel from "./SourcesPanel";
import FilterButton from "./FilterButton";

interface BookingInsightsPanelProps {
  metrics?: ArtistMetrics;
  topCities: CityOpportunityStat[];
  similarArtistCount: number;
  opportunityCount: number;
  sources: BookingSource[];
}

export default function BookingInsightsPanel({
  metrics,
  topCities,
  similarArtistCount,
  opportunityCount,
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
      <ArtistMetricsPanel
        metrics={metrics}
        topCities={topCities}
        similarArtistCount={similarArtistCount}
        opportunityCount={opportunityCount}
      />
      <TopCitiesPanel cities={topCities} />
      <SourcesPanel sources={sources} />
    </aside>
  );
}
