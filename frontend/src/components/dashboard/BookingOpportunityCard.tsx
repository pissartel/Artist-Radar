import Link from "next/link";
import type { Opportunity } from "@/types";
import {
  getMissingFields,
  getOpportunitySource,
  getOpportunityStatus,
  getOpportunitySubtitle,
  getOpportunityTitle,
  getShortRelevanceReason,
} from "@/lib/opportunity";

export const TYPE_LABELS: Record<string, string> = {
  venue: "Venue",
  festival: "Festival",
  concert: "Concert",
  opening_slot: "Opening Slot",
};

const TYPE_COLORS: Record<string, string> = {
  venue: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  festival: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  concert: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  opening_slot: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
};

interface BookingOpportunityCardProps {
  opportunity: Opportunity;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 85
      ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/25"
      : score >= 70
        ? "text-accent-light bg-accent/10 border-accent/25"
        : "text-yellow-400 bg-yellow-400/10 border-yellow-400/25";

  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border tabular-nums ${color}`}>
      {score}%
    </span>
  );
}

function StatusBadge({ status }: { status: "verified" | "needs_review" }) {
  if (status === "verified") {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border text-emerald-400 bg-emerald-400/10 border-emerald-400/20 whitespace-nowrap">
        Verified
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border text-amber-400 bg-amber-400/10 border-amber-400/20 whitespace-nowrap">
      Needs review
    </span>
  );
}

export default function BookingOpportunityCard({
  opportunity,
}: BookingOpportunityCardProps) {
  const typeBadgeClass =
    TYPE_COLORS[opportunity.type] ?? "text-gray-400 bg-gray-400/10 border-gray-400/20";
  const title = getOpportunityTitle(opportunity);
  const subtitle = getOpportunitySubtitle(opportunity);
  const relevanceReason = getShortRelevanceReason(opportunity);
  const missingFields = getMissingFields(opportunity);
  const status = getOpportunityStatus(opportunity);
  const source = getOpportunitySource(opportunity);

  return (
    <div className="bg-card rounded-xl p-4 border border-slate-400/10 shadow-card hover:bg-card-hover hover:border-accent/30 hover:shadow-card-hover transition-all duration-200 flex gap-4">
      <div className="w-11 h-11 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center flex-shrink-0">
        <span className="text-accent-light text-base font-semibold">
          {title.charAt(0)}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-semibold text-white truncate min-w-0">{title}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={status} />
            <button
              type="button"
              aria-label="Bookmark"
              className="text-gray-600 hover:text-accent-light transition-colors"
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
        </div>

        <p className="text-xs text-gray-500 mb-1.5">{subtitle}</p>

        <div className="flex items-center gap-2 mb-2">
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border whitespace-nowrap ${typeBadgeClass}`}
          >
            {TYPE_LABELS[opportunity.type] ?? opportunity.type}
          </span>
          <ScoreBadge score={opportunity.matchScore} />
        </div>

        {relevanceReason && (
          <p className="text-xs text-gray-400 leading-relaxed mb-2 line-clamp-2">
            <span className="text-gray-500">Why relevant: </span>
            {relevanceReason}
          </p>
        )}

        {missingFields.length > 0 && (
          <p className="text-xs text-amber-400/80 leading-relaxed mb-2">
            <span className="text-amber-400/60">Missing: </span>
            {missingFields.join(" · ")}
          </p>
        )}

        {source && (
          <p className="text-[10px] text-gray-600 mt-1">Source: {source}</p>
        )}

        <div className="mt-3">
          <Link
            href={`/opportunities/${opportunity.id}`}
            className="text-xs text-accent-light hover:text-white border border-accent/30 hover:border-accent-light hover:bg-accent/10 px-3 py-1.5 rounded-lg transition-all duration-150"
          >
            View details
          </Link>
        </div>
      </div>
    </div>
  );
}
