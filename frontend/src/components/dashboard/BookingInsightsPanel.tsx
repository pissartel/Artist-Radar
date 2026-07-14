import type { ArtistMetrics, CityOpportunityStat } from "@/types";
import TopCitiesPanel from "./TopCitiesPanel";
import ArtistMetricsPanel from "./ArtistMetricsPanel";

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
      <h3 className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest">
        Insights
      </h3>
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
