import MainLayout from "@/components/layout/MainLayout";
import ArtistHeader from "@/components/dashboard/ArtistHeader";
import KPICard from "@/components/dashboard/KPICard";
import SimilarArtistsSection from "@/components/dashboard/SimilarArtistsSection";
import BookingOpportunityCard from "@/components/dashboard/BookingOpportunityCard";
import {
  currentArtist,
  kpiCards,
  similarArtists,
  bookingOpportunities,
} from "@/data/mockData";

export default function DashboardPage() {
  return (
    <MainLayout>
      <ArtistHeader artist={currentArtist} />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpiCards.map((card) => (
          <KPICard key={card.label} card={card} />
        ))}
      </section>

      <SimilarArtistsSection artists={similarArtists} />

      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Booking Opportunities
        </h2>
        <div className="flex flex-col gap-3">
          {bookingOpportunities.map((opportunity) => (
            <BookingOpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
            />
          ))}
        </div>
      </section>
    </MainLayout>
  );
}
