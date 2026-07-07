import Link from "next/link";
import type { Opportunity } from "@/types";
import MatchReasonsList from "./MatchReasonsList";
import { formatOpportunityDate, getOpportunitySource } from "@/lib/opportunity";

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

export default function BookingOpportunityCard({
  opportunity,
}: BookingOpportunityCardProps) {
  const typeBadgeClass =
    TYPE_COLORS[opportunity.type] ?? "text-gray-400 bg-gray-400/10 border-gray-400/20";
  const formattedDate = formatOpportunityDate(opportunity.date);
  const source = getOpportunitySource(opportunity);

  return (
    <div className="bg-card rounded-xl p-4 border border-slate-400/10 shadow-card hover:bg-card-hover hover:border-accent/30 hover:shadow-card-hover transition-all duration-200 flex gap-4">
      <div className="w-11 h-11 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center flex-shrink-0">
        <span className="text-accent-light text-base font-semibold">
          {opportunity.title.charAt(0)}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <p className="text-sm font-semibold text-white truncate">
              {opportunity.title}
            </p>
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border whitespace-nowrap flex-shrink-0 ${typeBadgeClass}`}
            >
              {TYPE_LABELS[opportunity.type] ?? opportunity.type}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ScoreBadge score={opportunity.matchScore} />
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

        <p className="text-xs text-gray-500 mb-1.5">
          {opportunity.location}
          {formattedDate && <span> · {formattedDate}</span>}
        </p>

        <p className="text-xs text-gray-400 leading-relaxed mb-2 line-clamp-2">
          {opportunity.description}
        </p>

        {opportunity.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {opportunity.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] text-gray-500 bg-white/5 border border-slate-400/10 px-1.5 py-0.5 rounded-md"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <MatchReasonsList reasons={opportunity.matchReasons} />

        {source && (
          <p className="text-[10px] text-gray-600 mt-2">Source: {source}</p>
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
