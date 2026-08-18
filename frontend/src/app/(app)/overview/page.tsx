"use client";

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
import type { Opportunity } from "@/types";

function buildOpportunityPreview(opportunities: Opportunity[], limit = 8): Opportunity[] {
  const ranked = [...opportunities].sort((a, b) => b.matchScore - a.matchScore);
  const representativeByType = Array.from(
    new Map(ranked.map((opportunity) => [opportunity.type, opportunity])).values(),
  );
  const selected = new Set(representativeByType.slice(0, limit).map((item) => item.id));
  return [
    ...representativeByType.slice(0, limit),
    ...ranked.filter((item) => !selected.has(item.id)),
  ].slice(0, limit);
}

export default function OverviewPage() {
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

  const { artist, kpis, similarArtists, opportunities, topCities, warnings } = state.data;

  return (
    <>
      <WarningsBanner warnings={warnings} />
      <ArtistHeader artist={artist} />
      <KpiGrid metrics={kpis} />
      <SimilarArtistsSection artists={similarArtists} />

      <BookingSection
        opportunities={buildOpportunityPreview(opportunities)}
        topCities={topCities}
        metrics={artist.metrics}
        similarArtistCount={similarArtists.length}
      />
    </>
  );
}
