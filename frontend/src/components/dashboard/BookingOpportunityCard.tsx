import Link from "next/link";
import type { Opportunity } from "@/types";
import {
  getDisplayTitle,
  getOpportunitySubtitle,
  getShortRelevanceReason,
} from "@/lib/opportunity";
import MatchScoreBadge from "@/components/common/MatchScoreBadge";
import Card from "@/components/ui/Card";
import { productFeatures } from "@/lib/productFeatures";

export const TYPE_LABELS: Record<string, string> = {
  venue: "Venue",
  festival: "Festival",
  concert: "Concert",
  opening_slot: "Opening Slot",
};

// venue -> info, concert/festival -> warning ("event" category per
// design-system.md §2), opening_slot -> success, matching the badge
// examples in design-system.md §13.
const TYPE_COLORS: Record<string, string> = {
  venue: "text-info-text bg-info-tint border-info-tint",
  festival: "text-warning-text bg-warning-tint border-warning-tint",
  concert: "text-warning-text bg-warning-tint border-warning-tint",
  opening_slot: "text-success-text bg-success-tint border-success-tint",
};

interface BookingOpportunityCardProps {
  opportunity: Opportunity;
}

export default function BookingOpportunityCard({
  opportunity,
}: BookingOpportunityCardProps) {
  const typeBadgeClass =
    TYPE_COLORS[opportunity.type] ?? "text-foreground-muted bg-surface-elevated border-border";
  const title = getDisplayTitle(opportunity);
  const subtitle = getOpportunitySubtitle(opportunity);
  const relevanceReason = getShortRelevanceReason(opportunity);

  return (
    <Card variant="interactive" className="flex gap-4">
      <div className="w-11 h-11 rounded-xl bg-accent-tint border border-accent-tint flex items-center justify-center flex-shrink-0">
        <span className="text-accent-text text-base font-semibold">
          {title.charAt(0)}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-semibold text-foreground truncate min-w-0">{title}</p>
          {productFeatures.bookmarks && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                aria-label="Bookmark"
                className="text-foreground-disabled hover:text-accent-text transition-colors focus-visible:outline-none focus-visible:shadow-focus"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <p className="text-xs text-foreground-muted mb-1.5">{subtitle}</p>

        <div className="flex items-center gap-2 mb-2">
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border whitespace-nowrap ${typeBadgeClass}`}
          >
            {TYPE_LABELS[opportunity.type] ?? opportunity.type}
          </span>
          <MatchScoreBadge score={opportunity.matchScore} />
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
