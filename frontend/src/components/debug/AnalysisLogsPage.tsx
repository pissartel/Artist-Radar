"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import {
  ArtistRadarEmptyOnboardingState,
  ArtistRadarErrorState,
  ArtistRadarLoadingState,
} from "@/components/dashboard/ArtistRadarStates";
import { readOnboardingRequest } from "@/lib/onboardingRequest";
import { useArtistRadarData } from "@/lib/useArtistRadarData";

interface LogSection {
  id: string;
  title: string;
  description: string;
  value: unknown;
}

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function CopyButton({ value, label = "Copy" }: { value: unknown; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(serialize(value));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button variant="secondary" className="px-3 py-2 text-xs" onClick={copy}>
      {copied ? "Copied" : label}
    </Button>
  );
}

export default function AnalysisLogsPage() {
  const { state, refetch, executionId } = useArtistRadarData();

  if (state.status === "checking-onboarding" || state.status === "loading") {
    return <ArtistRadarLoadingState />;
  }
  if (state.status === "empty") return <ArtistRadarEmptyOnboardingState />;
  if (state.status === "error") {
    return <ArtistRadarErrorState message={state.message} onRetry={refetch} />;
  }

  const response = state.data;
  let storedOnboarding: unknown = null;
  try {
    const raw = window.localStorage.getItem("artistRadarOnboardingData");
    storedOnboarding = raw ? JSON.parse(raw) : null;
  } catch {
    storedOnboarding = { error: "Unable to read artistRadarOnboardingData" };
  }

  const request = readOnboardingRequest();
  const sections: LogSection[] = [
      {
        id: "request",
        title: "Request & onboarding",
        description: "Stored onboarding values and the normalized request used by the web client.",
        value: { executionId, storedOnboarding, normalizedRequest: request },
      },
      {
        id: "artist",
        title: "Artist",
        description: "Resolved user artist profile, KPIs and scale information.",
        value: { artist: response.artist, kpis: response.kpis, artistScale: response.artistScale },
      },
      {
        id: "similar-artists",
        title: "Similar artists",
        description: `${response.similarArtists.length} similar artist result(s).`,
        value: response.similarArtists,
      },
      {
        id: "booking",
        title: "Booking opportunities",
        description: `${response.bookingOpportunities.length} opportunity result(s).`,
        value: response.bookingOpportunities,
      },
      {
        id: "diagnostics",
        title: "Pipeline diagnostics",
        description: "Effective input, cache version, provider counts, sources and warnings.",
        value: {
          bookingDiagnostics: response.bookingDiagnostics,
          sources: response.sources,
          warnings: response.warnings,
        },
      },
      {
        id: "locations",
        title: "Locations & map data",
        description: "Aggregated cities and geocoded entities used by the overview.",
        value: { topCities: response.topCities },
      },
      {
        id: "full-response",
        title: "Complete response",
        description: "The complete ArtistRadarResponse currently rendered by the UI.",
        value: response,
      },
    ];

  const completeLog = {
    exportedAt: new Date().toISOString(),
    pageUrl: window.location.href,
    sections: Object.fromEntries(sections.map((section) => [section.id, section.value])),
  };

  function download() {
    const blob = new Blob([serialize(completeLog)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `artist-radar-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-text">Preview diagnostics</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Analysis logs</h1>
          <p className="mt-2 max-w-3xl text-sm text-foreground-secondary">
            Inspect exactly what the browser stored, requested and received. This page is disabled in production.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={completeLog} label="Copy all" />
          <Button variant="primary" className="px-3 py-2 text-xs" onClick={download}>
            Download JSON
          </Button>
        </div>
      </header>

      {sections.map((section) => (
        <section key={section.id} className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-foreground">{section.title}</h2>
              <p className="mt-1 text-xs text-foreground-muted">{section.description}</p>
            </div>
            <CopyButton value={section.value} />
          </div>
          <pre className="max-h-[520px] overflow-auto rounded-lg border border-border bg-background p-4 font-mono text-xs leading-relaxed text-success-text">
            {serialize(section.value)}
          </pre>
        </section>
      ))}
    </div>
  );
}
