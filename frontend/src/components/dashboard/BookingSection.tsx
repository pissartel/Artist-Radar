import Link from "next/link";
import type { Opportunity, BookingSource, CityOpportunityStat } from "@/types";
import BookingTabs from "./BookingTabs";
import BookingInsightsPanel from "./BookingInsightsPanel";

interface BookingSectionProps {
  opportunities: Opportunity[];
  topCities: CityOpportunityStat[];
  matchExplanations: string[];
  sources: BookingSource[];
}

export default function BookingSection({
  opportunities,
  topCities,
  matchExplanations,
  sources,
}: BookingSectionProps) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 rounded-full bg-accent" />
          <h2 className="text-sm font-semibold text-white uppercase tracking-widest">
            Booking Opportunities
          </h2>
          <span className="text-xs font-medium text-accent-light bg-accent/15 border border-accent/25 px-2 py-0.5 rounded-full tabular-nums">
            {opportunities.length}
          </span>
        </div>
        <Link
          href="/booking"
          className="text-xs text-accent-light hover:text-white transition-colors"
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
            topCities={topCities}
            matchExplanations={matchExplanations}
            sources={sources}
          />
        </div>
      </div>
    </section>
  );
}
