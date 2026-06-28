interface MatchExplanationPanelProps {
  explanations: string[];
}

export default function MatchExplanationPanel({ explanations }: MatchExplanationPanelProps) {
  return (
    <div className="bg-card rounded-lg p-4 border border-white/5">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Why these matches?
      </h3>
      <ul className="flex flex-col gap-2">
        {explanations.map((reason) => (
          <li key={reason} className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent/70 flex-shrink-0" />
            <span className="text-xs text-gray-300">{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
