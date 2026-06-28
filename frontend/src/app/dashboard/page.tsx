import MainLayout from "@/components/layout/MainLayout";
import ArtistHeader from "@/components/dashboard/ArtistHeader";
import KpiGrid from "@/components/dashboard/KpiGrid";
import SimilarArtistsSection from "@/components/dashboard/SimilarArtistsSection";
import BookingSection from "@/components/dashboard/BookingSection";
import { mockDashboardData } from "@/data/mockDashboardData";

export default function DashboardPage() {
  const { artist, kpis, similarArtists, bookingOpportunities } =
    mockDashboardData;

  return (
    <MainLayout>
      <ArtistHeader artist={artist} />
      <KpiGrid metrics={kpis} />
      <SimilarArtistsSection artists={similarArtists} />

      <BookingSection opportunities={bookingOpportunities} />
    </MainLayout>
  );
}
