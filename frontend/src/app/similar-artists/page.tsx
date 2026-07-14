"use client";

import MainLayout from "@/components/layout/MainLayout";
import SimilarArtistsExplorer from "@/components/dashboard/SimilarArtistsExplorer";
import WarningsBanner from "@/components/dashboard/WarningsBanner";
import {
  ArtistRadarEmptyOnboardingState,
  ArtistRadarErrorState,
  ArtistRadarLoadingState,
} from "@/components/dashboard/ArtistRadarStates";
import { useArtistRadarData } from "@/lib/useArtistRadarData";

export default function SimilarArtistsPage() {
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

  const { similarArtists, warnings } = state.data;

  return (
    <MainLayout>
      <WarningsBanner warnings={warnings} />
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Similar Artists</h1>
        <p className="text-sm text-foreground-secondary mt-1.5">
          Explore every similar artist found for your profile to understand your scene
          and find useful references for booking research.
        </p>
      </div>
      <SimilarArtistsExplorer artists={similarArtists} />
    </MainLayout>
  );
}
