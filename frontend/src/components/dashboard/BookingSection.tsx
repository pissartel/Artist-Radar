import type { BookingOpportunity } from "@/types";
import BookingTabs from "./BookingTabs";

interface BookingSectionProps {
  opportunities: BookingOpportunity[];
}

export default function BookingSection({ opportunities }: BookingSectionProps) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Booking Opportunities
        </h2>
        <span className="text-xs text-gray-600">{opportunities.length} found</span>
      </div>
      <BookingTabs opportunities={opportunities} />
    </section>
  );
}
