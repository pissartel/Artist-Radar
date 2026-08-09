import MatchScoreBadge from "@/components/common/MatchScoreBadge";
import Card from "@/components/ui/Card";
import type { ManagerOpportunity } from "@/types";

function formatEntityType(value: ManagerOpportunity["entityType"]): string {
  return value === "management_company" ? "Management company" : "Manager";
}

function formatLocation(manager: ManagerOpportunity): string {
  return [manager.city, manager.country].filter(Boolean).join(", ") || "Location not published";
}

export default function ManagerOpportunityCard({ manager }: { manager: ManagerOpportunity }) {
  const primaryUrl = manager.websiteUrl ?? manager.sourceUrl;

  return (
    <Card variant="interactive" className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{manager.name}</p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {formatEntityType(manager.entityType)} · {formatLocation(manager)}
          </p>
        </div>
        <MatchScoreBadge score={manager.compatibilityScore} />
      </div>

      {manager.relevantArtists.length > 0 && (
        <p className="text-xs text-foreground-secondary">
          <span className="text-foreground-muted">Discovered through: </span>
          {manager.relevantArtists.slice(0, 4).join(", ")}
        </p>
      )}

      <p className="line-clamp-3 text-xs leading-relaxed text-foreground-secondary">
        {manager.compatibilityExplanation}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {manager.genres.slice(0, 3).map((genre) => (
          <span key={genre} className="rounded-md border border-border bg-white/5 px-1.5 py-0.5 text-[10px] text-foreground-secondary">
            {genre}
          </span>
        ))}
        {manager.typicalAudienceLevel !== "unknown" && (
          <span className="rounded-md border border-border bg-white/5 px-1.5 py-0.5 text-[10px] capitalize text-foreground-secondary">
            {manager.typicalAudienceLevel} artists
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-1 text-xs">
        {primaryUrl && (
          <a className="text-accent-text hover:text-foreground" href={primaryUrl} target="_blank" rel="noreferrer">
            View source
          </a>
        )}
        {manager.contactPageUrl && (
          <a className="text-accent-text hover:text-foreground" href={manager.contactPageUrl} target="_blank" rel="noreferrer">
            Contact policy
          </a>
        )}
      </div>
    </Card>
  );
}
