"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArtistRadarClientError, fetchArtistRadarData } from "@/lib/artistRadarClient";
import { readOnboardingRequest } from "@/lib/onboardingRequest";
import type { ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";

export type ArtistRadarDataState =
  | { status: "checking-onboarding" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: ArtistRadarResponse };

export interface UseArtistRadarDataResult {
  state: ArtistRadarDataState;
  refetch: () => void;
}

function buildQueryKey(request: ArtistRadarRequest | null) {
  return [
    "artistRadar",
    request?.artistName ?? null,
    request?.genre ?? null,
    request?.location ?? null,
    request?.enableBooking ?? null,
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
    setRequest(readOnboardingRequest());
  }, []);

  const query: UseQueryResult<ArtistRadarResponse> = useQuery({
    queryKey: buildQueryKey(request ?? null),
    queryFn: () => fetchArtistRadarData(request as ArtistRadarRequest),
    enabled: Boolean(request),
  });

  if (request === undefined) {
    return { state: { status: "checking-onboarding" }, refetch: () => {} };
  }
  if (request === null) {
    return { state: { status: "empty" }, refetch: () => {} };
  }
  if (query.isPending) {
    return { state: { status: "loading" }, refetch: () => query.refetch() };
  }
  if (query.isError) {
    return { state: { status: "error", message: toErrorMessage(query.error) }, refetch: () => query.refetch() };
  }
  return { state: { status: "success", data: query.data }, refetch: () => query.refetch() };
}
