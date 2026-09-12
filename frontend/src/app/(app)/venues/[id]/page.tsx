"use client";

import Link from "next/link";
import { use } from "react";
import VenueDetail from "@/components/dashboard/VenueDetail";
import {
  ArtistRadarEmptyOnboardingState,
  ArtistRadarErrorState,
  ArtistRadarLoadingState,
} from "@/components/dashboard/ArtistRadarStates";
import { useArtistRadarData } from "@/lib/useArtistRadarData";
import { getOpportunitiesForVenue, getVenueById } from "@/lib/venue";

interface VenueDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function VenueDetailPage({ params }: VenueDetailPageProps) {
  const { id } = use(params);
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

  const { opportunities } = state.data;
  const venue = getVenueById(opportunities, id);

  if (!venue) {
    return (
      <div className="max-w-lg">
        <Link href="/booking" className="text-xs text-accent-text hover:text-foreground transition-colors">
          ← Back to Opportunities
        </Link>
        <h1 className="text-xl font-bold text-foreground mt-4">Venue not found</h1>
        <p className="text-sm text-foreground-secondary mt-1.5">
          We couldn&apos;t find a venue with this ID. It may have been removed or the link is
          incorrect.
        </p>
      </div>
    );
  }

  const events = getOpportunitiesForVenue(opportunities, id);

  return <VenueDetail venue={venue} events={events} />;
}
