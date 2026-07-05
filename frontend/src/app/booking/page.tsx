import MainLayout from "@/components/layout/MainLayout";
import BookingExplorer from "@/components/dashboard/BookingExplorer";
import { getDashboardData } from "@/lib/getDashboardData";

export default async function BookingPage() {
  const { artist, bookingOpportunities } = await getDashboardData();

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Booking</h1>
        <p className="text-sm text-gray-400 mt-1.5">
          Explore every venue, concert, opening slot, and festival opportunity found for your
          profile to decide which ones to pursue.
        </p>
      </div>
      <BookingExplorer
        opportunities={bookingOpportunities}
        artistCity={artist.city}
        artistCountry={artist.country}
      />
    </MainLayout>
  );
}
