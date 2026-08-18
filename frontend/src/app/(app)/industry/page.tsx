"use client";

import { useQuery } from "@tanstack/react-query";
import BookingExplorer from "@/components/dashboard/BookingExplorer";
import WarningsBanner from "@/components/dashboard/WarningsBanner";
import { ArtistRadarEmptyOnboardingState, ArtistRadarErrorState, ArtistRadarLoadingState } from "@/components/dashboard/ArtistRadarStates";
import { fetchDeepManagerSearch } from "@/lib/managerSearchClient";
import { useArtistRadarData } from "@/lib/useArtistRadarData";

export default function IndustryPage() {
  const { state, refetch } = useArtistRadarData();
  const data = state.status === "success" ? state.data : null;
  const deepSearch = useQuery({
    queryKey: ["opportunitySearch", "managers", data?.artist.id ?? null],
    queryFn: () => fetchDeepManagerSearch(data!.artist, data!.similarArtists),
    enabled: false,
    staleTime: 6 * 60 * 60 * 1_000,
    gcTime: 24 * 60 * 60 * 1_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  if (state.status === "checking-onboarding" || state.status === "loading") return <ArtistRadarLoadingState />;
  if (state.status === "empty") return <ArtistRadarEmptyOnboardingState />;
  if (state.status === "error") return <ArtistRadarErrorState message={state.message} onRetry={refetch} />;

  const managers = deepSearch.data?.opportunities ?? state.data.opportunities.filter((item) => item.type === "manager");
  const labels = state.data.opportunities.filter((item) => item.type === "label");
  const warnings = [...state.data.warnings, ...(deepSearch.data?.warnings ?? [])];

  return <>
    <WarningsBanner warnings={warnings} />
    <div className="mb-6">
      <h1 className="text-xl font-bold text-foreground">Industry</h1>
      <p className="mt-1.5 text-sm text-foreground-secondary">Develop your career with relevant professional opportunities.</p>
    </div>
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest">Managers &amp; management companies</h2>
        <button type="button" onClick={() => void deepSearch.refetch()} disabled={deepSearch.isFetching} className="rounded-lg border border-border px-3 py-1.5 text-xs text-accent-text disabled:opacity-50">
          {deepSearch.isFetching ? "Searching…" : "Search deeper"}
        </button>
      </div>
      <BookingExplorer opportunities={managers} artistCity={state.data.artist.city} artistCountry={state.data.artist.country} resultLabel="management opportunities" />
    </section>
    <section>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest">Labels</h2>
      <BookingExplorer opportunities={labels} artistCity={state.data.artist.city} artistCountry={state.data.artist.country} resultLabel="label opportunities" />
    </section>
  </>;
}
