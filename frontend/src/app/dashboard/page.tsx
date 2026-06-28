import MainLayout from "@/components/layout/MainLayout";
import ArtistHeader from "@/components/dashboard/ArtistHeader";
import KpiGrid from "@/components/dashboard/KpiGrid";
import SimilarArtistsSection from "@/components/dashboard/SimilarArtistsSection";
import BookingOpportunityCard from "@/components/dashboard/BookingOpportunityCard";
import { mockDashboardData } from "@/data/mockDashboardData";

export default function DashboardPage() {
  const { artist, kpis, similarArtists, bookingOpportunities } =
    mockDashboardData;

  return (
    <MainLayout>
      <ArtistHeader artist={artist} />
      <KpiGrid metrics={kpis} />
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
