import { getMatchScoreBadgeClass } from "@/lib/scoreStyles";

interface MatchScoreBadgeProps {
  score: number;
  size?: "sm" | "md";
  label?: string;
  className?: string;
}

const SIZE_CLASSES: Record<"sm" | "md", string> = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-3 py-1",
};

export default function MatchScoreBadge({
  score,
  size = "sm",
  label,
  className = "",
}: MatchScoreBadgeProps) {
  const colorClass = getMatchScoreBadgeClass(score);

  return (
    <span
      className={`font-semibold rounded-full border tabular-nums whitespace-nowrap ${SIZE_CLASSES[size]} ${colorClass} ${className}`}
    >
      {score}%{label ? ` ${label}` : ""}
    </span>
  );
}
