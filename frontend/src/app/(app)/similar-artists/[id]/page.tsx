"use client";

import Link from "next/link";
import { use } from "react";
import SimilarArtistDetail from "@/components/dashboard/SimilarArtistDetail";
import {
  ArtistRadarEmptyOnboardingState,
  ArtistRadarErrorState,
  ArtistRadarLoadingState,
} from "@/components/dashboard/ArtistRadarStates";
import { useArtistRadarData } from "@/lib/useArtistRadarData";
import { getRelatedOpportunities, getSimilarArtistById } from "@/lib/similarArtist";

interface SimilarArtistDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function SimilarArtistDetailPage({ params }: SimilarArtistDetailPageProps) {
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

  const { artist, similarArtists, opportunities } = state.data;
  const similarArtist = getSimilarArtistById(similarArtists, id);

  if (!similarArtist) {
    return (
      <div className="max-w-lg">
        <Link
          href="/similar-artists"
          className="text-xs text-accent-text hover:text-foreground transition-colors"
        >
          ← Back to Similar Artists
        </Link>
        <h1 className="text-xl font-bold text-foreground mt-4">Similar artist not found</h1>
        <p className="text-sm text-foreground-secondary mt-1.5">
          We couldn&apos;t find a similar artist with this ID. It may have been removed or
          the link is incorrect.
        </p>
      </div>
    );
  }

  const relatedOpportunities = getRelatedOpportunities(opportunities, similarArtist.id);

  return (
    <SimilarArtistDetail
      artist={similarArtist}
      referenceArtistGenres={artist.genres}
      relatedOpportunities={relatedOpportunities}
    />
  );
}
