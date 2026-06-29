interface MatchExplanationPanelProps {
  explanations: string[];
}

export default function MatchExplanationPanel({ explanations }: MatchExplanationPanelProps) {
  return (
    <div className="bg-card rounded-xl p-4 border border-slate-400/12 shadow-card">
      <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
        Why these matches?
      </h3>
      <ul className="flex flex-col gap-2.5">
        {explanations.map((reason) => (
          <li key={reason} className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent/70 flex-shrink-0 mt-1" />
            <span className="text-xs text-gray-300 leading-relaxed">{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
