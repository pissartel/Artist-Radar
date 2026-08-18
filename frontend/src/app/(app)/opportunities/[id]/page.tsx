"use client";

import Link from "next/link";
import { use } from "react";
import OpportunityDetail from "@/components/dashboard/OpportunityDetail";
import {
  ArtistRadarEmptyOnboardingState,
  ArtistRadarErrorState,
  ArtistRadarLoadingState,
} from "@/components/dashboard/ArtistRadarStates";
import { useArtistRadarData } from "@/lib/useArtistRadarData";
import { getOpportunityById } from "@/lib/opportunity";

interface OpportunityDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function OpportunityDetailPage({ params }: OpportunityDetailPageProps) {
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

  const { opportunities, similarArtists } = state.data;
  const opportunity = getOpportunityById(opportunities, id);

  if (!opportunity) {
    return (
      <div className="max-w-lg">
        <Link
          href="/booking"
          className="text-xs text-accent-text hover:text-foreground transition-colors"
        >
          ← Back to Opportunities
        </Link>
        <h1 className="text-xl font-bold text-foreground mt-4">Opportunity not found</h1>
        <p className="text-sm text-foreground-secondary mt-1.5">
          We couldn&apos;t find an opportunity with this ID. It may have been removed or the
          link is incorrect.
        </p>
      </div>
    );
  }

  const relatedArtists = similarArtists.filter((artist) =>
    opportunity.relatedSimilarArtistIds?.includes(artist.id),
  );

  return <OpportunityDetail opportunity={opportunity} relatedArtists={relatedArtists} similarArtists={similarArtists} />;
}
