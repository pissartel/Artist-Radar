"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import type { ManagerOpportunity } from "@/types";
import ManagerOpportunityCard from "./ManagerOpportunityCard";

const PAGE_SIZE = 9;

interface ManagersExplorerProps {
  managers: ManagerOpportunity[];
  isDeepSearchRunning: boolean;
  deepSearchError: string | null;
  deepSearchCompleted: boolean;
  onDeepSearch: () => void;
}

export default function ManagersExplorer({
  managers,
  isDeepSearchRunning,
  deepSearchError,
  deepSearchCompleted,
  onDeepSearch,
}: ManagersExplorerProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sorted = useMemo(
    () => [...managers].sort((left, right) => right.compatibilityScore - left.compatibilityScore),
    [managers],
  );
  const visible = sorted.slice(0, visibleCount);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {deepSearchCompleted ? "Deep-search results" : "Cached lightweight results"}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Deep search checks more similar artists and sources, and runs only when you request it.
          </p>
        </div>
        <Button variant="gradient" onClick={onDeepSearch} disabled={isDeepSearchRunning}>
          {isDeepSearchRunning ? "Searching…" : deepSearchCompleted ? "Refresh deep search" : "Launch deeper search"}
        </Button>
      </div>

      {deepSearchError && (
        <div role="alert" className="mb-4 rounded-lg border border-danger-tint bg-danger-tint p-3 text-sm text-danger-text">
          {deepSearchError}
        </div>
      )}

      {visible.length > 0 ? (
        <>
          <p className="mb-3 text-xs text-foreground-disabled">Showing {visible.length} of {sorted.length} sourced managers</p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {visible.map((manager) => <ManagerOpportunityCard key={manager.id} manager={manager} />)}
          </div>
          {visibleCount < sorted.length && (
            <div className="mt-5 flex justify-center">
              <Button variant="secondary" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Load more</Button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-foreground-muted shadow-card-glow">
          No manager with verifiable professional activity is available yet.
        </div>
      )}
    </div>
  );
}
