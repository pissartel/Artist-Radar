import type { BookingSource } from "@/types";

interface SourcesPanelProps {
  sources: BookingSource[];
}

export default function SourcesPanel({ sources }: SourcesPanelProps) {
  return (
    <div className="bg-card rounded-xl p-4 border border-slate-400/12 shadow-card">
      <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
        Sources
      </h3>
      <ul className="flex flex-col gap-2">
        {sources.map((source) => (
          <li key={source.id} className="flex items-center justify-between py-0.5">
            <span className="text-xs text-gray-300">{source.name}</span>
            {source.opportunityCount !== undefined && (
              <span className="text-xs font-semibold text-gray-600 tabular-nums bg-white/5 px-1.5 py-0.5 rounded-md">
                {source.opportunityCount}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
