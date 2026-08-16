"use client";

import dynamic from "next/dynamic";
import type { ArtistProfile, Opportunity, SimilarArtist } from "@/types";

const EcosystemMapClient = dynamic(() => import("./EcosystemMapClient"), {
  ssr: false,
  loading: () => <div className="h-[430px] animate-pulse rounded-xl border border-border bg-surface" aria-label="Loading geographic ecosystem map" />,
});

export interface EcosystemMapProps {
  artist: ArtistProfile;
  opportunities: Opportunity[];
  similarArtists: SimilarArtist[];
}

export default function EcosystemMap(props: EcosystemMapProps) {
  return <EcosystemMapClient {...props} />;
}
