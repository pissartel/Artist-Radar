"use client";

import BookingExplorer from "@/components/dashboard/BookingExplorer";
import WarningsBanner from "@/components/dashboard/WarningsBanner";
import {
  ArtistRadarEmptyOnboardingState,
  ArtistRadarErrorState,
  ArtistRadarLoadingState,
} from "@/components/dashboard/ArtistRadarStates";
import { useArtistRadarData } from "@/lib/useArtistRadarData";

export default function BookingPage() {
  const { state, refetch } = useArtistRadarData();

  if (state.status === "checking-onboarding" || state.status === "loading") {
    return <ArtistRadarLoadingState />;
  }

  if (state.status === "empty") {
    return <ArtistRadarEmptyOnboardingState />;
  }

  if (state.status === "error") {
    return <ArtistRadarErrorState message={state.message} onRetry={refetch} />;
  }

  const { artist, opportunities, warnings } = state.data;
  const bookingOpportunities = opportunities.filter((opportunity) =>
    ["concert", "opening_slot", "festival", "booker"].includes(opportunity.type),
  );

  return (
    <>
      <WarningsBanner warnings={warnings} />
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Booking</h1>
        <p className="text-sm text-foreground-secondary mt-1.5">
          Explore concerts, opening slots, festivals, and booking professionals. Use the type
          filter to keep events and bookers clearly separated.
        </p>
      </div>
      <BookingExplorer
        opportunities={bookingOpportunities}
        artistCity={artist.city}
        artistCountry={artist.country}
        resultLabel="booking opportunities"
      />
    </>
  );
}
