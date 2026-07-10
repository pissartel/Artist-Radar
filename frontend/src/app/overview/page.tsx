"use client";

import MainLayout from "@/components/layout/MainLayout";
import ArtistHeader from "@/components/dashboard/ArtistHeader";
import KpiGrid from "@/components/dashboard/KpiGrid";
import SimilarArtistsSection from "@/components/dashboard/SimilarArtistsSection";
import BookingSection from "@/components/dashboard/BookingSection";
import WarningsBanner from "@/components/dashboard/WarningsBanner";
import {
  ArtistRadarEmptyOnboardingState,
  ArtistRadarErrorState,
  ArtistRadarLoadingState,
} from "@/components/dashboard/ArtistRadarStates";
import { useArtistRadarData } from "@/lib/useArtistRadarData";

export default function OverviewPage() {
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

  const { artist, kpis, similarArtists, bookingOpportunities, topCities, warnings } = state.data;

  return (
    <MainLayout>
      <WarningsBanner warnings={warnings} />
      <ArtistHeader artist={artist} />
      <KpiGrid metrics={kpis} />
      <SimilarArtistsSection artists={similarArtists} />

      <BookingSection
        opportunities={bookingOpportunities}
        topCities={topCities}
        metrics={artist.metrics}
        similarArtistCount={similarArtists.length}
      />
    </MainLayout>
  );
}
