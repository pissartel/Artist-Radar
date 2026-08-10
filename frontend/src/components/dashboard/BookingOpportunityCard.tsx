import type { ReactNode } from "react";
import Link from "next/link";
import type { Opportunity } from "@/types";
import {
  getDisplayTitle,
  getShortRelevanceReason,
  getPositiveMatchFactors,
  getNegativeMatchFactors,
  getNeutralMatchFactors,
  formatOpportunityDate,
  getCardFamily,
  getOrganizationTypeLabel,
} from "@/lib/opportunity";
import MatchScoreBadge from "@/components/common/MatchScoreBadge";
import OpportunityImage from "@/components/common/OpportunityImage";
import OpportunityActions from "@/components/dashboard/OpportunityActions";
import Card from "@/components/ui/Card";

export const TYPE_LABELS: Record<string, string> = {
  venue: "Venue",
  festival: "Festival",
  concert: "Concert",
  opening_slot: "Opening Slot",
  organization: "Organization",
};

// venue -> info, concert/festival -> warning ("event" category per
// design-system.md §2), opening_slot -> success, organization -> accent,
// matching the badge examples in design-system.md §13.
const TYPE_COLORS: Record<string, string> = {
  venue: "text-info-text bg-info-tint border-info-tint",
  festival: "text-warning-text bg-warning-tint border-warning-tint",
  concert: "text-warning-text bg-warning-tint border-warning-tint",
  opening_slot: "text-success-text bg-success-tint border-success-tint",
  organization: "text-accent-text bg-accent-tint border-accent-tint",
};

function FactPill({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] text-foreground-secondary bg-white/5 border border-border px-1.5 py-0.5 rounded-md whitespace-nowrap">
      {children}
    </span>
  );
}

// Concert/festival/opening-slot layout: date and location come first since
// those are what artists scan for first (per booking domain rules).
function EventCardMeta({ opportunity }: { opportunity: Opportunity }) {
  const date = formatOpportunityDate(opportunity.date);
  const headline = [date, opportunity.venue, opportunity.city ?? opportunity.location]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    <div className="mb-1.5">
      <p className="text-xs font-medium text-foreground-secondary">{headline || opportunity.location}</p>
      {opportunity.lineup.length > 0 && (
        <p className="text-[11px] text-foreground-muted mt-0.5 truncate">
          Lineup: {opportunity.lineup.join(", ")}
        </p>
      )}
      {opportunity.relatedArtist && (
        <p className="text-[11px] text-foreground-muted mt-0.5 truncate">
          Related to similar artist: {opportunity.relatedArtist.name}
        </p>
      )}
    </div>
  );
}

// Venue layout: capacity and contact availability are what tell an artist
// whether it's worth reaching out. Genre evidence belongs in match analysis,
// not as a venue fact.
function VenueCardMeta({ opportunity }: { opportunity: Opportunity }) {
  return (
    <div className="mb-1.5">
      <p className="text-xs text-foreground-muted">{opportunity.city ?? opportunity.location}</p>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {opportunity.venueCapacity != null && (
          <FactPill>~{opportunity.venueCapacity.toLocaleString()} capacity</FactPill>
        )}
        {opportunity.contact && <FactPill>Contact available</FactPill>}
      </div>
      {opportunity.recentEvents.length > 0 && (
        <p className="text-[11px] text-foreground-muted mt-1.5 truncate">
          Recent: {opportunity.recentEvents.slice(0, 2).join(", ")}
        </p>
      )}
    </div>
  );
}

// Organization layout (labels, bookers, promoters, associations, ...):
// leads with what kind of organization it is and how to reach it.
function OrganizationCardMeta({ opportunity }: { opportunity: Opportunity }) {
  return (
    <div className="mb-1.5">
      <p className="text-xs text-foreground-muted">
        {getOrganizationTypeLabel(opportunity)} · {opportunity.city ?? opportunity.location}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {opportunity.genres.slice(0, 3).map((genre) => (
          <FactPill key={genre}>{genre}</FactPill>
        ))}
        <FactPill>{opportunity.contact ? "Contact/submission available" : "No contact found"}</FactPill>
      </div>
    </div>
  );
}

interface BookingOpportunityCardProps {
  opportunity: Opportunity;
}

export default function BookingOpportunityCard({
  opportunity,
}: BookingOpportunityCardProps) {
  const typeBadgeClass =
    TYPE_COLORS[opportunity.type] ?? "text-foreground-muted bg-surface-elevated border-border";
  const title = getDisplayTitle(opportunity);
  const relevanceReason = getShortRelevanceReason(opportunity);
  const family = getCardFamily(opportunity);

  return (
    <Card variant="interactive" className="flex gap-4">
      <OpportunityImage src={opportunity.imageUrl} alt={title} variant="thumbnail" />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-semibold text-foreground truncate min-w-0">{title}</p>
          <OpportunityActions opportunity={opportunity} variant="compact" className="flex-shrink-0" />
        </div>

        {family === "venue" && <VenueCardMeta opportunity={opportunity} />}
        {family === "organization" && <OrganizationCardMeta opportunity={opportunity} />}
        {family === "event" && <EventCardMeta opportunity={opportunity} />}

        <div className="flex items-center gap-2 mb-2">
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border whitespace-nowrap ${typeBadgeClass}`}
          >
            {TYPE_LABELS[opportunity.type] ?? opportunity.type}
          </span>
          <MatchScoreBadge
            score={opportunity.matchScore}
            positiveFactors={getPositiveMatchFactors(opportunity)}
            negativeFactors={getNegativeMatchFactors(opportunity)}
            neutralFactors={getNeutralMatchFactors(opportunity)}
          />
        </div>

        {relevanceReason && (
          <p className="text-xs text-foreground-secondary leading-relaxed mb-2 line-clamp-2">
            <span className="text-foreground-muted">Why relevant: </span>
            {relevanceReason}
          </p>
        )}

        <div className="mt-3">
          <Link
            href={`/opportunities/${opportunity.id}`}
            className="text-xs text-accent-text hover:text-foreground border border-border-subtle hover:border-border-accent-hover hover:bg-accent-tint px-3 py-1.5 rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:shadow-focus"
          >
            View details
          </Link>
        </div>
      </div>
    </Card>
  );
}
