"use client";

import ArtistHeader from "@/components/dashboard/ArtistHeader";
import KpiGrid from "@/components/dashboard/KpiGrid";
import SimilarArtistsSection from "@/components/dashboard/SimilarArtistsSection";
import BookingSection from "@/components/dashboard/BookingSection";
import EcosystemMap from "@/components/dashboard/EcosystemMap";
import WarningsBanner from "@/components/dashboard/WarningsBanner";
import {
  ArtistRadarEmptyOnboardingState,
  ArtistRadarErrorState,
  ArtistRadarLoadingState,
} from "@/components/dashboard/ArtistRadarStates";
import { useArtistRadarData } from "@/lib/useArtistRadarData";
import {
  selectOverviewMapOpportunities,
  selectOverviewSimilarArtists,
} from "@/lib/overviewSelection";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { buttonClassName } from "@/components/ui/Button";

export default function OverviewPage() {
  const { state, refetch } = useArtistRadarData();
  const { user, loading: authLoading } = useAuth();

  if (state.status === "checking-onboarding" || state.status === "loading") {
    return <ArtistRadarLoadingState />;
  }

  if (state.status === "empty") {
    return <ArtistRadarEmptyOnboardingState />;
  }

  if (state.status === "error") {
    return <ArtistRadarErrorState message={state.message} onRetry={refetch} />;
  }

  const { artist, kpis, similarArtists, bookingOpportunities, topCities, warnings } = state.data;

  return (
    <>
      {!authLoading && !user && (
        <aside className="mb-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-accent/30 bg-surface p-5 sm:flex-row sm:items-center">
          <div><p className="font-bold text-foreground">Keep this workspace</p><p className="mt-1 text-sm text-foreground-secondary">Create an account to save these results and return to them later. You can keep exploring without one.</p></div>
          <Link href="/register?next=%2Foverview" className={buttonClassName("gradient", "shrink-0")}>Save my results</Link>
        </aside>
      )}
      <WarningsBanner warnings={warnings} />
      <ArtistHeader artist={artist} />
      <KpiGrid metrics={kpis} />
      <SimilarArtistsSection artists={similarArtists} />

      <EcosystemMap
        artist={artist}
        similarArtists={selectOverviewSimilarArtists(similarArtists)}
        opportunities={selectOverviewMapOpportunities(bookingOpportunities)}
      />

      <BookingSection
        opportunities={bookingOpportunities}
        topCities={topCities}
        metrics={artist.metrics}
        similarArtistCount={similarArtists.length}
      />
    </>
  );
}
