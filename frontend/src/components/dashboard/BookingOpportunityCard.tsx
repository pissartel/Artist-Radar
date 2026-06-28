import type { BookingOpportunity } from "@/types";
import MatchReasonsList from "./MatchReasonsList";

const TYPE_LABELS: Record<string, string> = {
  venue: "Venue",
  festival: "Festival",
  concert: "Concert",
  opening_slot: "Opening Slot",
};

const TYPE_COLORS: Record<string, string> = {
  venue: "text-blue-400 bg-blue-400/10",
  festival: "text-purple-400 bg-purple-400/10",
  concert: "text-yellow-400 bg-yellow-400/10",
  opening_slot: "text-green-400 bg-green-400/10",
};

interface BookingOpportunityCardProps {
  opportunity: BookingOpportunity;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 85
      ? "text-green-400 bg-green-400/10"
      : score >= 70
        ? "text-accent-light bg-accent/10"
        : "text-yellow-400 bg-yellow-400/10";

  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {score}%
    </span>
  );
}

export default function BookingOpportunityCard({
  opportunity,
}: BookingOpportunityCardProps) {
  const typeBadgeClass =
    TYPE_COLORS[opportunity.type] ?? "text-gray-400 bg-gray-400/10";

  return (
    <div className="bg-card rounded-lg p-4 border border-white/5 flex gap-4">
      <div className="w-12 h-12 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
        <span className="text-accent-light text-lg font-semibold">
          {opportunity.title.charAt(0)}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {opportunity.title}
            </p>
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0 ${typeBadgeClass}`}
            >
              {TYPE_LABELS[opportunity.type] ?? opportunity.type}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ScoreBadge score={opportunity.matchScore} />
            <button
              type="button"
              aria-label="Bookmark"
              className="text-gray-600 hover:text-gray-400 transition-colors"
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

        <p className="text-xs text-gray-500 mb-1.5">{opportunity.location}</p>

        <p className="text-xs text-gray-400 leading-relaxed mb-2">
          {opportunity.description}
        </p>

        {opportunity.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {opportunity.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] text-gray-500 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <MatchReasonsList reasons={opportunity.matchReasons} />

        <div className="mt-3">
          <button
            type="button"
            className="text-xs text-accent-light hover:text-white border border-accent/30 hover:border-accent-light px-3 py-1.5 rounded transition-colors"
          >
            View details
          </button>
        </div>
      </div>
    </div>
  );
}
