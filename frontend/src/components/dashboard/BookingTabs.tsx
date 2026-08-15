"use client";

import { useMemo, useState } from "react";
import type { Opportunity } from "@/types";
import { filterBookingOpportunities, type BookingTabName } from "@/lib/opportunity";
import { useProductFeatures } from "@/components/providers/ProductFeaturesProvider";
import BookingOpportunityCard from "./BookingOpportunityCard";

const BASE_TABS: BookingTabName[] = [
  "All",
  "Venues",
  "Concerts",
  "Festivals",
  "Opening Slots",
  "Contacts",
];

const OVERVIEW_OPPORTUNITY_LIMIT = 10;

const EMPTY_STATE_MESSAGE: Record<BookingTabName, string> = {
  All: "No booking opportunities found in this analysis",
  Concerts: "No concert opportunities found in this analysis",
  Venues: "No venue opportunities found in this analysis",
  Festivals: "No festival opportunities found in this analysis",
  "Opening Slots": "No opening slot opportunities found in this analysis",
  Contacts: "No booking contacts found in this analysis",
  "Raw JSON": "No booking opportunities found in this analysis",
};

interface BookingTabsProps {
  opportunities: Opportunity[];
}

function EmptyTabState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-10 h-10 rounded-full bg-white/5 border border-border flex items-center justify-center mb-3">
        <span className="text-foreground-disabled text-lg">—</span>
      </div>
      <p className="text-sm text-foreground-muted">{message}</p>
    </div>
  );
}

function RawJsonTab({ opportunities }: { opportunities: Opportunity[] }) {
  return (
    <pre className="h-full bg-background rounded-xl p-4 border border-border text-xs text-success-text overflow-auto leading-relaxed font-mono shadow-card">
      {JSON.stringify(opportunities, null, 2)}
    </pre>
  );
}

export default function BookingTabs({ opportunities }: BookingTabsProps) {
  const { debugUIVisible } = useProductFeatures();
  const [activeTab, setActiveTab] = useState<BookingTabName>("All");

  // Raw JSON is a developer diagnostic view, not a product tab — never shown
  // to production users. debugUIVisible is server-derived (see
  // lib/server/debugUI.ts), never computed from a client-only env var.
  const TABS: BookingTabName[] = useMemo(
    () => (debugUIVisible ? [...BASE_TABS, "Raw JSON"] : BASE_TABS),
    [debugUIVisible],
  );

  const tabCounts = useMemo(() => {
    const counts = {} as Record<BookingTabName, number>;
    for (const tab of TABS) {
      counts[tab] = filterBookingOpportunities(opportunities, tab).length;
    }
    return counts;
  }, [opportunities, TABS]);

  const activeOpportunities = useMemo(
    () => filterBookingOpportunities(opportunities, activeTab),
    [opportunities, activeTab],
  );
  const visibleOpportunities = activeOpportunities.slice(0, OVERVIEW_OPPORTUNITY_LIMIT);

  return (
    <div>
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1 bg-surface-elevated/50 rounded-xl p-1.5 border border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-all duration-150 flex-shrink-0 focus-visible:outline-none focus-visible:shadow-focus ${
              activeTab === tab
                ? "bg-accent-tint text-accent-text border border-accent-tint font-bold"
                : "text-foreground-muted font-medium hover:text-foreground-secondary hover:bg-white/5 border border-transparent"
            }`}
          >
            {tab}
            {tab !== "Raw JSON" && (
              <span className="ml-1.5 tabular-nums opacity-70">{tabCounts[tab]}</span>
            )}
          </button>
        ))}
      </div>

      <div
        role="region"
        aria-label={`${activeTab} opportunities`}
        tabIndex={0}
        className="h-[min(70vh,640px)] min-h-80 overflow-y-auto overscroll-contain pr-1 focus-visible:outline-none focus-visible:shadow-focus [scrollbar-gutter:stable]"
      >
        {activeTab === "Raw JSON" ? (
          <RawJsonTab opportunities={opportunities} />
        ) : activeOpportunities.length > 0 ? (
          <div className="flex flex-col gap-3">
            {visibleOpportunities.map((opportunity) => (
              <BookingOpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
            {activeOpportunities.length > OVERVIEW_OPPORTUNITY_LIMIT && (
              <p className="pb-1 text-center text-xs text-foreground-muted">
                Showing the top {OVERVIEW_OPPORTUNITY_LIMIT} of {activeOpportunities.length}
              </p>
            )}
          </div>
        ) : (
          <EmptyTabState message={EMPTY_STATE_MESSAGE[activeTab]} />
        )}
      </div>
    </div>
  );
}
