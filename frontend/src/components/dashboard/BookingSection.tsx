import type { BookingOpportunity, BookingSource, CityOpportunityStat, DashboardData } from "@/types";
import BookingTabs from "./BookingTabs";
import BookingInsightsPanel from "./BookingInsightsPanel";

interface BookingSectionProps {
  opportunities: BookingOpportunity[];
  topCities: CityOpportunityStat[];
  matchExplanations: string[];
  sources: BookingSource[];
  dashboardData: DashboardData;
}

export default function BookingSection({
  opportunities,
  topCities,
  matchExplanations,
  sources,
  dashboardData,
}: BookingSectionProps) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Booking Opportunities
        </h2>
        <span className="text-xs text-gray-600">{opportunities.length} found</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <BookingTabs opportunities={opportunities} dashboardData={dashboardData} />
        <BookingInsightsPanel
          topCities={topCities}
          matchExplanations={matchExplanations}
          sources={sources}
        />
      </div>
    </section>
  );
}
