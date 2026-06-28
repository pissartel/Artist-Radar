import type { BookingSource } from "@/types";

interface SourcesPanelProps {
  sources: BookingSource[];
}

export default function SourcesPanel({ sources }: SourcesPanelProps) {
  return (
    <div className="bg-card rounded-lg p-4 border border-white/5">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Sources
      </h3>
      <ul className="flex flex-col gap-2">
        {sources.map((source) => (
          <li key={source.id} className="flex items-center justify-between">
            <span className="text-xs text-gray-300">{source.name}</span>
            {source.opportunityCount !== undefined && (
              <span className="text-xs font-semibold text-gray-500 tabular-nums">
                {source.opportunityCount}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
