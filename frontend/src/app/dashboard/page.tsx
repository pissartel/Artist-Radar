import MainLayout from "@/components/layout/MainLayout";
import ArtistHeader from "@/components/dashboard/ArtistHeader";
import KpiGrid from "@/components/dashboard/KpiGrid";
import SimilarArtistsSection from "@/components/dashboard/SimilarArtistsSection";
import BookingSection from "@/components/dashboard/BookingSection";
import { getDashboardData } from "@/lib/getDashboardData";

export default async function DashboardPage() {
  const { artist, kpis, similarArtists, bookingOpportunities, topCities, matchExplanations, sources } =
    await getDashboardData();

  return (
    <MainLayout>
      <ArtistHeader artist={artist} />
      <KpiGrid metrics={kpis} />
      <SimilarArtistsSection artists={similarArtists} />

      <BookingSection
        opportunities={bookingOpportunities}
        topCities={topCities}
        matchExplanations={matchExplanations}
        sources={sources}
        dashboardData={{ artist, kpis, similarArtists, bookingOpportunities, topCities, matchExplanations, sources }}
      />
    </MainLayout>
  );
}
