"use client";

import { useMemo, useState } from "react";
import type { Opportunity, OpportunityCategory } from "@/types";
import {
  CATEGORY_LABELS,
  sortOpportunities,
  type OpportunitySortOption,
} from "@/lib/opportunity";
import BookingOpportunityCard from "./BookingOpportunityCard";
import Select from "@/components/ui/Select";

interface BookingExplorerProps {
  opportunities: Opportunity[];
  artistCity?: string;
  artistCountry?: string;
}

type PresenceFilter = "all" | "has" | "missing";

const MATCH_SCORE_OPTIONS = [
  { label: "Any match score", value: 0 },
  { label: "90%+", value: 90 },
  { label: "80%+", value: 80 },
  { label: "70%+", value: 70 },
  { label: "60%+", value: 60 },
];

const SORT_OPTIONS: { label: string; value: OpportunitySortOption }[] = [
  { label: "Best match", value: "best_match" },
  { label: "Newest", value: "newest" },
  { label: "Closest location", value: "closest_location" },
  { label: "Most actionable", value: "most_actionable" },
];

export default function BookingExplorer({
  opportunities,
  artistCity,
  artistCountry,
}: BookingExplorerProps) {
  const [category, setCategory] = useState<"all" | OpportunityCategory>("all");
  const [city, setCity] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [dateFilter, setDateFilter] = useState<PresenceFilter>("all");
  const [contactFilter, setContactFilter] = useState<PresenceFilter>("all");
  const [sortBy, setSortBy] = useState<OpportunitySortOption>("best_match");

  const categories = useMemo(
    () => Array.from(new Set(opportunities.map((opportunity) => opportunity.category))).sort(),
    [opportunities],
  );

  const cities = useMemo(
    () =>
      Array.from(
        new Set(opportunities.map((opportunity) => opportunity.city ?? opportunity.location)),
      ).sort(),
    [opportunities],
  );

  const hasDateData = useMemo(() => opportunities.some((o) => o.date), [opportunities]);
  const hasContactData = useMemo(() => opportunities.some((o) => o.contact), [opportunities]);

  const filteredOpportunities = useMemo(() => {
    const filtered = opportunities.filter((opportunity) => {
      const matchesCategory = category === "all" || opportunity.category === category;
      const matchesCity =
        city === "all" || (opportunity.city ?? opportunity.location) === city;
      const matchesScore = opportunity.matchScore >= minScore;
      const matchesDate =
        dateFilter === "all" ||
        (dateFilter === "has" ? Boolean(opportunity.date) : !opportunity.date);
      const matchesContact =
        contactFilter === "all" ||
        (contactFilter === "has" ? Boolean(opportunity.contact) : !opportunity.contact);

      return (
        matchesCategory && matchesCity && matchesScore && matchesDate && matchesContact
      );
    });

    return sortOpportunities(filtered, sortBy, artistCity, artistCountry);
  }, [
    opportunities,
    category,
    city,
    minScore,
    dateFilter,
    contactFilter,
    sortBy,
    artistCity,
    artistCountry,
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Select
          dense
          value={category}
          onChange={(event) => setCategory(event.target.value as "all" | OpportunityCategory)}
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c] ?? c}
            </option>
          ))}
        </Select>
        <Select dense value={city} onChange={(event) => setCity(event.target.value)}>
          <option value="all">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          dense
          value={minScore}
          onChange={(event) => setMinScore(Number(event.target.value))}
        >
          {MATCH_SCORE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {hasDateData && (
          <Select
            dense
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value as PresenceFilter)}
          >
            <option value="all">Any date</option>
            <option value="has">Has a date</option>
            <option value="missing">No date yet</option>
          </Select>
        )}
        {hasContactData && (
          <Select
            dense
            value={contactFilter}
            onChange={(event) => setContactFilter(event.target.value as PresenceFilter)}
          >
            <option value="all">Any contact</option>
            <option value="has">Has contact</option>
            <option value="missing">No contact yet</option>
          </Select>
        )}
        <Select
          dense
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as OpportunitySortOption)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <p className="text-xs text-foreground-disabled mb-3">
        {filteredOpportunities.length} of {opportunities.length} booking opportunities
      </p>

      {filteredOpportunities.length > 0 ? (
        <div className="flex flex-col gap-3">
          {filteredOpportunities.map((opportunity) => (
            <BookingOpportunityCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border shadow-card-glow p-6 text-sm text-foreground-muted">
          No booking opportunities match your filters.
        </div>
      )}
    </div>
  );
}
