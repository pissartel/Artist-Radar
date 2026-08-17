"use client";

import dynamic from "next/dynamic";
import type { Opportunity } from "@/types";

const MAPPABLE_TYPES = new Set<Opportunity["type"]>(["concert", "venue", "opening_slot"]);

const OpportunityMapClient = dynamic(() => import("./OpportunityMapClient"), {
  ssr: false,
  loading: () => <div className="mt-4 h-52 animate-pulse rounded-xl border border-border bg-surface" aria-label="Loading opportunity map" />,
});

export default function OpportunityMap({ opportunity }: { opportunity: Opportunity }) {
  if (!MAPPABLE_TYPES.has(opportunity.type)) return null;
  if (!Number.isFinite(opportunity.latitude) || !Number.isFinite(opportunity.longitude)) return null;
  return <OpportunityMapClient opportunity={opportunity} />;
}
