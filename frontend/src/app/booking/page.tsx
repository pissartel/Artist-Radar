"use client";

import MainLayout from "@/components/layout/MainLayout";
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
    return (
      <MainLayout>
        <ArtistRadarLoadingState />
      </MainLayout>
    );
  }

  if (state.status === "empty") {
    return (
      <MainLayout>
        <ArtistRadarEmptyOnboardingState />
      </MainLayout>
    );
  }

  if (state.status === "error") {
    return (
      <MainLayout>
        <ArtistRadarErrorState message={state.message} onRetry={refetch} />
      </MainLayout>
    );
  }

  const { artist, bookingOpportunities, warnings } = state.data;

  return (
    <MainLayout>
      <WarningsBanner warnings={warnings} />
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
