"use client";

import { useState } from "react";
import type { BookingOpportunity } from "@/types";
import BookingOpportunityCard from "./BookingOpportunityCard";

const TABS = [
  "Opportunities",
  "Venues",
  "Concerts",
  "Festivals",
  "Opening Slots",
  "Contacts",
  "Raw JSON",
] as const;

type TabName = (typeof TABS)[number];

interface BookingTabsProps {
  opportunities: BookingOpportunity[];
}

function EmptyTabState({ tab }: { tab: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-10 h-10 rounded-full bg-white/5 border border-slate-400/10 flex items-center justify-center mb-3">
        <span className="text-gray-600 text-lg">—</span>
      </div>
      <p className="text-sm text-gray-500">No {tab.toLowerCase()} yet.</p>
      <p className="text-xs text-gray-600 mt-1">
        This section will be available soon.
      </p>
    </div>
  );
}

function RawJsonTab({ opportunities }: { opportunities: BookingOpportunity[] }) {
  return (
    <pre className="bg-[#0d1117] rounded-xl p-4 border border-slate-400/10 text-xs text-emerald-400 overflow-x-auto overflow-y-auto max-h-[600px] leading-relaxed font-mono shadow-card">
      {JSON.stringify(opportunities, null, 2)}
    </pre>
  );
}

export default function BookingTabs({ opportunities }: BookingTabsProps) {
  const [activeTab, setActiveTab] = useState<TabName>("Opportunities");

  return (
    <div>
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1 bg-card-alt/50 rounded-xl p-1.5 border border-slate-400/10">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap transition-all duration-150 flex-shrink-0 ${
              activeTab === tab
                ? "bg-accent/25 text-accent-light border border-accent/35 shadow-sm"
                : "text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Opportunities" && (
        <div className="flex flex-col gap-3">
          {opportunities.map((opportunity) => (
            <BookingOpportunityCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </div>
      )}
      {activeTab === "Raw JSON" && (
        <RawJsonTab opportunities={opportunities} />
      )}
      {activeTab !== "Opportunities" && activeTab !== "Raw JSON" && (
        <EmptyTabState tab={activeTab} />
      )}
    </div>
  );
}
