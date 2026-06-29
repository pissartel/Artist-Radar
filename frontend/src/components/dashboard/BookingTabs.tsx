"use client";

import { useState } from "react";
import type { BookingOpportunity, DashboardData } from "@/types";
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
  dashboardData: DashboardData;
}

function EmptyTabState({ tab }: { tab: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm text-gray-500">No {tab.toLowerCase()} yet.</p>
      <p className="text-xs text-gray-600 mt-1">
        This section will be available soon.
      </p>
    </div>
  );
}

function RawJsonTab({ data }: { data: DashboardData }) {
  return (
    <pre className="bg-[#0d1117] rounded-lg p-4 border border-white/5 text-xs text-green-400 overflow-x-auto overflow-y-auto max-h-[600px] leading-relaxed font-mono">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default function BookingTabs({ opportunities, dashboardData }: BookingTabsProps) {
  const [activeTab, setActiveTab] = useState<TabName>("Opportunities");

  return (
    <div>
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`text-xs font-medium px-3 py-1.5 rounded whitespace-nowrap transition-colors ${
              activeTab === tab
                ? "bg-accent/20 text-accent-light border border-accent/30"
                : "text-gray-500 hover:text-gray-300 border border-transparent"
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
      {activeTab === "Raw JSON" && <RawJsonTab data={dashboardData} />}
      {activeTab !== "Opportunities" && activeTab !== "Raw JSON" && (
        <EmptyTabState tab={activeTab} />
      )}
    </div>
  );
}
