import Link from "next/link";
import type { ArtistMetrics, Opportunity, CityOpportunityStat } from "@/types";
import BookingTabs from "./BookingTabs";
import BookingInsightsPanel from "./BookingInsightsPanel";
import Badge from "@/components/ui/Badge";

interface BookingSectionProps {
  opportunities: Opportunity[];
  topCities: CityOpportunityStat[];
  metrics?: ArtistMetrics;
  similarArtistCount: number;
}

export default function BookingSection({
  opportunities,
  topCities,
  metrics,
  similarArtistCount,
}: BookingSectionProps) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 rounded-full bg-primary" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-widest">
            Opportunities
          </h2>
          <Badge variant="accent" className="tabular-nums">
            {opportunities.length}
          </Badge>
        </div>
        <Link
          href="/booking"
          className="text-xs text-accent-text hover:text-foreground transition-colors"
        >
          View all
        </Link>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-5">
        <div className="min-w-0">
          <BookingTabs opportunities={opportunities} />
        </div>
        <div className="min-w-0">
          <BookingInsightsPanel
            metrics={metrics}
            topCities={topCities}
            similarArtistCount={similarArtistCount}
            opportunityCount={opportunities.length}
          />
        </div>
      </div>
    </section>
  );
}
