"use client";

import { useProductFeatures } from "@/components/providers/ProductFeaturesProvider";

interface WarningsBannerProps {
  warnings: string[];
}

// Provider/source diagnostics for the artist's search — internal operational
// detail (which scraper failed, which API key is missing, etc.), not a
// product-facing state. Never shown to production users, regardless of
// whether warnings exist; only rendered when debugUIVisible is on (server-
// derived — see lib/server/debugUI.ts).
export default function WarningsBanner({ warnings }: WarningsBannerProps) {
  const { debugUIVisible } = useProductFeatures();
  if (warnings.length === 0 || !debugUIVisible) {
    return null;
  }

  return (
    <div
      role="status"
      className="mb-6 rounded-xl border border-warning-tint bg-warning-tint p-4"
    >
      <p className="text-xs font-semibold text-warning-text uppercase tracking-widest mb-2">
        Heads up (debug)
      </p>
      <ul className="flex flex-col gap-1">
        {warnings.map((warning) => (
          <li key={warning} className="text-xs text-foreground-secondary leading-relaxed">
            {warning}
          </li>
        ))}
      </ul>
    </div>
  );
}
