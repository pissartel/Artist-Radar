"use client";

import { useQuery } from "@tanstack/react-query";
import ManagersExplorer from "@/components/dashboard/ManagersExplorer";
import WarningsBanner from "@/components/dashboard/WarningsBanner";
import { ArtistRadarEmptyOnboardingState, ArtistRadarErrorState, ArtistRadarLoadingState } from "@/components/dashboard/ArtistRadarStates";
import { fetchDeepManagerSearch } from "@/lib/managerSearchClient";
import { useArtistRadarData } from "@/lib/useArtistRadarData";

export default function ManagersPage() {
  const { state, refetch } = useArtistRadarData();
  const data = state.status === "success" ? state.data : null;
  const deepSearch = useQuery({
    queryKey: ["managerSearch", "deep", data?.artist.id ?? null, data?.similarArtists.map((artist) => artist.id).join(",") ?? null],
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

  const managers = deepSearch.data?.managers ?? state.data.managerOpportunities;
  const warnings = [...state.data.warnings, ...(deepSearch.data?.warnings ?? [])];
  return (
    <>
      <WarningsBanner warnings={warnings} />
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Managers</h1>
        <p className="mt-1.5 text-sm text-foreground-secondary">
          Discover sourced managers and management companies connected to artists in your scene and at a compatible career stage.
        </p>
      </div>
      <ManagersExplorer
        managers={managers}
        isDeepSearchRunning={deepSearch.isFetching}
        deepSearchError={deepSearch.error instanceof Error ? deepSearch.error.message : null}
        deepSearchCompleted={Boolean(deepSearch.data)}
        onDeepSearch={() => void deepSearch.refetch()}
      />
    </>
  );
}
