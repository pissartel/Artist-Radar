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
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { buttonClassName } from "@/components/ui/Button";

export default function OverviewPage() {
  const { state, refetch } = useArtistRadarData();
  const { user, loading: authLoading } = useAuth();
  const [showSavedBanner, setShowSavedBanner] = useState(false);

  useEffect(() => {
    const arrivedAfterSave = new URLSearchParams(window.location.search).get("saved") === "1";
    const dismissed = window.localStorage.getItem("nextstageSavedBannerDismissed") === "1";
    setShowSavedBanner(arrivedAfterSave && !dismissed);
  }, []);

  function dismissSavedBanner() {
    window.localStorage.setItem("nextstageSavedBannerDismissed", "1");
    setShowSavedBanner(false);
  }

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
      {showSavedBanner && user && (
        <aside className="animate-ns-in-slow -mx-4 mb-6 flex items-center gap-3 border-b border-success/20 bg-success/10 px-5 py-3.5 text-sm font-semibold text-success-text sm:-mx-6 lg:-mx-8">
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-success-tint text-[11px]">✓</span>
          <span className="flex-1">Your analysis is saved. Everything you ran as a guest is now on your account.</span>
          <button type="button" onClick={dismissSavedBanner} className="text-[13px] font-semibold text-foreground-muted">Dismiss</button>
        </aside>
      )}
      {!authLoading && !user && (
        <aside className="mb-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-accent/30 bg-surface p-5 sm:flex-row sm:items-center">
          <div><p className="font-bold text-foreground">Keep this analysis</p><p className="mt-1 text-sm text-foreground-secondary">Create an account to keep these results, unlock contacts and continue exploring opportunities. Nothing reruns.</p></div>
          <Link href="/signup?from=results&next=%2Foverview" className={buttonClassName("gradient", "shrink-0")}>Save my analysis</Link>
        </aside>
      )}
      <WarningsBanner warnings={warnings} />
      {!authLoading && !user && <div className="mb-3 flex justify-end"><span className="inline-flex items-center gap-2 rounded-full bg-accent-tint px-3 py-1.5 text-xs font-bold text-accent-text"><i className="h-1.5 w-1.5 rounded-full bg-accent-text" />Guest session</span></div>}
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
