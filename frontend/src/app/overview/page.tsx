"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ArtistHeader from "@/components/dashboard/ArtistHeader";
import KpiGrid from "@/components/dashboard/KpiGrid";
import SimilarArtistsSection from "@/components/dashboard/SimilarArtistsSection";
import BookingSection from "@/components/dashboard/BookingSection";
import WarningsBanner from "@/components/dashboard/WarningsBanner";
import { ArtistRadarClientError, fetchArtistRadarData } from "@/lib/artistRadarClient";
import type { ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";
import type { OnboardingFormData } from "@/types";

const ONBOARDING_STORAGE_KEY = "artistRadarOnboardingData";

type LoadState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "success"; data: ArtistRadarResponse };

function readOnboardingRequest(): ArtistRadarRequest | null {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!stored) {
    return null;
  }

  let onboarding: Partial<OnboardingFormData>;
  try {
    onboarding = JSON.parse(stored);
  } catch {
    return null;
  }

  const artistName = onboarding.artistName?.trim();
  const genre = onboarding.mainGenre?.trim();
  const location = onboarding.city?.trim() || onboarding.countryOfOrigin?.trim();

  if (!artistName || !genre || !location) {
    return null;
  }

  return {
    artistName,
    genre,
    location,
    enableBooking: onboarding.mainGoal !== "similar_artists",
  };
}

function LoadingState() {
  return (
    <div
      className="bg-card rounded-xl border border-slate-400/10 shadow-card-glow p-10 flex flex-col items-center justify-center text-center"
      role="status"
      aria-live="polite"
    >
      <div className="w-8 h-8 rounded-full border-2 border-accent/20 border-t-accent-light animate-spin mb-4" />
      <p className="text-sm text-gray-400">Loading your Artist Radar data...</p>
    </div>
  );
}

function EmptyOnboardingState() {
  return (
    <div className="bg-card rounded-xl border border-slate-400/10 shadow-card-glow p-10 flex flex-col items-center justify-center text-center">
      <p className="text-sm text-white font-medium">No artist search yet.</p>
      <p className="text-xs text-gray-500 mt-1.5 max-w-sm">
        Tell us about your artist project to get similar artists and booking opportunities.
      </p>
      <Link
        href="/onboarding"
        className="mt-4 bg-accent hover:bg-accent/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors duration-150"
      >
        Start a search
      </Link>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="bg-card rounded-xl border border-red-400/30 shadow-card-glow p-10 flex flex-col items-center justify-center text-center"
      role="alert"
    >
      <p className="text-sm text-red-300 font-medium">Something went wrong.</p>
      <p className="text-xs text-gray-500 mt-1.5 max-w-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 bg-accent hover:bg-accent/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors duration-150"
      >
        Try again
      </button>
    </div>
  );
}

export default function OverviewPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(() => {
    const request = readOnboardingRequest();
    if (!request) {
      setState({ status: "empty" });
      return;
    }

    setState({ status: "loading" });
    fetchArtistRadarData(request)
      .then((data) => setState({ status: "success", data }))
      .catch((error) => {
        const message =
          error instanceof ArtistRadarClientError
            ? error.message
            : "Failed to load Artist Radar data. Please try again.";
        setState({ status: "error", message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <MainLayout>
        <LoadingState />
      </MainLayout>
    );
  }

  if (state.status === "empty") {
    return (
      <MainLayout>
        <EmptyOnboardingState />
      </MainLayout>
    );
  }

  if (state.status === "error") {
    return (
      <MainLayout>
        <ErrorState message={state.message} onRetry={load} />
      </MainLayout>
    );
  }

  const { artist, kpis, similarArtists, bookingOpportunities, topCities, matchExplanations, sources, warnings } =
    state.data;

  return (
    <MainLayout>
      <WarningsBanner warnings={warnings} />
      <ArtistHeader artist={artist} />
      <KpiGrid metrics={kpis} />
      <SimilarArtistsSection artists={similarArtists} />

      <BookingSection
        opportunities={bookingOpportunities}
        topCities={topCities}
        matchExplanations={matchExplanations}
        sources={sources}
      />
    </MainLayout>
  );
}
