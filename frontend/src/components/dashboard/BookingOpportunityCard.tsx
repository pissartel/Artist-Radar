import type { BookingOpportunity } from "@/types";

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
      {score}
    </span>
  );
}

export default function BookingOpportunityCard({
  opportunity,
}: BookingOpportunityCardProps) {
  return (
    <div className="bg-card rounded-lg p-4 border border-white/5 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-white truncate">
            {opportunity.venue}
          </p>
          <ScoreBadge score={opportunity.score} />
        </div>
        <p className="text-xs text-gray-500 mb-2">{opportunity.city}</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          {opportunity.reason}
        </p>
      </div>
    </div>
  );
}
