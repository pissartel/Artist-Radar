interface MatchReasonsListProps {
  reasons: string[];
}

export default function MatchReasonsList({ reasons }: MatchReasonsListProps) {
  if (reasons.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 mt-2">
      {reasons.map((reason) => (
        <li key={reason} className="flex items-start gap-1.5 text-xs text-foreground-secondary min-w-0">
          <span className="w-1 h-1 rounded-full bg-accent-light/60 flex-shrink-0 mt-1.5" />
          <span className="line-clamp-2">{reason}</span>
        </li>
      ))}
    </ul>
  );
}
