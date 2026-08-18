"use client";

import { useQuery } from "@tanstack/react-query";
import BookingExplorer from "@/components/dashboard/BookingExplorer";
import WarningsBanner from "@/components/dashboard/WarningsBanner";
import {
  ArtistRadarEmptyOnboardingState,
  ArtistRadarErrorState,
  ArtistRadarLoadingState,
} from "@/components/dashboard/ArtistRadarStates";
import { useArtistRadarData } from "@/lib/useArtistRadarData";
import { fetchDeepBookerSearch } from "@/lib/bookerSearchClient";

export default function BookingPage() {
  const { state, refetch } = useArtistRadarData();
  const data = state.status === "success" ? state.data : null;
  const deepSearch = useQuery({
    queryKey: ["opportunitySearch", "bookers", data?.artist.id ?? null],
    queryFn: () => fetchDeepBookerSearch(data!.artist, data!.similarArtists),
    enabled: false,
    staleTime: 6 * 60 * 60 * 1_000,
    gcTime: 24 * 60 * 60 * 1_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

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
  const events = opportunities.filter((opportunity) => ["concert", "opening_slot", "festival"].includes(opportunity.type));
  const lightweightBookers = opportunities.filter((opportunity) => opportunity.type === "booker");
  const bookers = deepSearch.data?.opportunities ?? lightweightBookers;
  const bookingOpportunities = [...events, ...bookers];

  return (
    <>
      <WarningsBanner warnings={[...warnings, ...(deepSearch.data?.warnings ?? [])]} />
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Booking</h1>
        <p className="text-sm text-foreground-secondary mt-1.5">
          Explore concerts, opening slots, festivals, and booking professionals. Use the type
          filter to keep events and bookers clearly separated.
        </p>
      </div>
      <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Bookers, agencies &amp; promoters</p>
          <p className="mt-1 text-xs text-foreground-secondary">The profile loads a short high-confidence selection. Run a broader search here when you need more prospects.</p>
        </div>
        <button type="button" onClick={() => void deepSearch.refetch()} disabled={deepSearch.isFetching} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs text-accent-text disabled:opacity-50">
          {deepSearch.isFetching ? "Searching…" : deepSearch.data ? "Search again" : "Search more bookers"}
        </button>
      </div>
      {deepSearch.isError && <p className="mb-4 text-sm text-danger-text">{deepSearch.error.message}</p>}
      <BookingExplorer
        opportunities={bookingOpportunities}
        artistCity={artist.city}
        artistCountry={artist.country}
        resultLabel="booking opportunities"
      />
    </>
  );
}
