"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArtistRadarClientError, fetchArtistRadarData } from "@/lib/artistRadarClient";
import {
  readArtistRadarResponse,
  writeArtistRadarResponse,
} from "@/lib/artistRadarResponseCache";
import { readOnboardingRequest } from "@/lib/onboardingRequest";
import type { ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";
import { createPreviewArtistRadarResponse } from "@/lib/previewData";

export type ArtistRadarDataState =
  | { status: "checking-onboarding" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: ArtistRadarResponse };

export interface UseArtistRadarDataResult {
  state: ArtistRadarDataState;
  refetch: () => void;
  // Id sent alongside the analysis request so the analyzing page can poll
  // GET /api/artist-radar/status/[executionId] for real pipeline stage
  // progress (issue #135). Null until the onboarding request has been read.
  executionId: string | null;
}

function buildQueryKey(request: ArtistRadarRequest | null) {
  return [
    "artistRadar",
    request?.artistName ?? null,
    request?.genre ?? null,
    request?.location ?? null,
    request?.enableBooking ?? null,
    request?.previewData ?? null,
  ] as const;
}

function toErrorMessage(error: unknown): string {
  return error instanceof ArtistRadarClientError
    ? error.message
    : "Failed to load Artist Radar data. Please try again.";
}

/**
 * Reads the persisted onboarding input and fetches Artist Radar data for it.
 * Shared by the Overview, Booking, and Similar Artists pages (and their detail
 * pages) so they all render the same cached ArtistRadarResponse instead of
 * each page issuing its own fetch/mock data.
 */
export function useArtistRadarData(): UseArtistRadarDataResult {
  const [request, setRequest] = useState<ArtistRadarRequest | null | undefined>(undefined);

  useEffect(() => {
    function loadRequest() {
      const onboardingRequest = readOnboardingRequest();
      // Attach a fresh executionId so a real analysis run can be polled for
      // progress; harmless for pages that don't poll it (see backendTypes.ts).
      setRequest(onboardingRequest ? { ...onboardingRequest, executionId: crypto.randomUUID() } : onboardingRequest);
    }
    loadRequest();
    window.addEventListener("artist-radar-workspace-restored", loadRequest);
    return () => window.removeEventListener("artist-radar-workspace-restored", loadRequest);
  }, []);

  const query: UseQueryResult<ArtistRadarResponse> = useQuery({
    queryKey: buildQueryKey(request ?? null),
    queryFn: async () => {
      const activeRequest = request as ArtistRadarRequest;
      const data = activeRequest.previewData
        ? createPreviewArtistRadarResponse(activeRequest)
        : await fetchArtistRadarData(activeRequest);
      writeArtistRadarResponse(activeRequest, data);
      return data;
    },
    enabled: Boolean(request),
    initialData: request ? () => readArtistRadarResponse(request) : undefined,
  });

  const executionId = request?.executionId ?? null;

  if (request === undefined) {
    return { state: { status: "checking-onboarding" }, refetch: () => {}, executionId: null };
  }
  if (request === null) {
    return { state: { status: "empty" }, refetch: () => {}, executionId: null };
  }
  if (query.isPending) {
    return { state: { status: "loading" }, refetch: () => query.refetch(), executionId };
  }
  if (query.isError) {
    return {
      state: { status: "error", message: toErrorMessage(query.error) },
      refetch: () => query.refetch(),
      executionId,
    };
  }
  return { state: { status: "success", data: query.data }, refetch: () => query.refetch(), executionId };
}
