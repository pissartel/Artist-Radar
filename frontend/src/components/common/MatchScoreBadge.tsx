"use client";

import { useId, useState } from "react";
import type { MatchFactor } from "@/types";
import { getMatchScoreBadgeClass } from "@/lib/scoreStyles";

interface MatchScoreBadgeProps {
  score: number;
  size?: "sm" | "md";
  label?: string;
  className?: string;
  positiveFactors?: MatchFactor[];
  negativeFactors?: MatchFactor[];
  neutralFactors?: MatchFactor[];
}

const SIZE_CLASSES: Record<"sm" | "md", string> = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-3 py-1",
};

// Compact score indicator that reveals its factor breakdown on hover, focus,
// or click — never hover-only, so it works on mobile/keyboard too (issue
// #130 review feedback). Renders as a plain, non-interactive badge when no
// factors are available (e.g. legacy data without a match breakdown).
export default function MatchScoreBadge({
  score,
  size = "sm",
  label,
  className = "",
  positiveFactors = [],
  negativeFactors = [],
  neutralFactors = [],
}: MatchScoreBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const colorClass = getMatchScoreBadgeClass(score);
  const badgeClassName = `font-semibold rounded-full border tabular-nums whitespace-nowrap ${SIZE_CLASSES[size]} ${colorClass}`;
  const hasFactors = positiveFactors.length > 0 || negativeFactors.length > 0 || neutralFactors.length > 0;

  if (!hasFactors) {
    return (
      <span className={`${badgeClassName} ${className}`}>
        {score}%{label ? ` ${label}` : ""}
      </span>
    );
  }

  return (
    <span
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        className={`${badgeClassName} focus-visible:outline-none focus-visible:shadow-focus`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
      >
        {score}%{label ? ` ${label}` : ""}
      </button>
      {isOpen && (
        <div
          id={panelId}
          role="group"
          aria-label="Match score breakdown"
          className="absolute z-10 top-full mt-1.5 right-0 w-64 max-w-[80vw] bg-surface-elevated border border-border rounded-lg shadow-card-hover p-3 text-left"
        >
          <MatchFactorGroup title="Good fit" factors={positiveFactors} tone="success" icon="✓" />
          <MatchFactorGroup title="Things to consider" factors={negativeFactors} tone="warning" icon="!" />
          <MatchFactorGroup title="Unknown / not verified" factors={neutralFactors} tone="neutral" icon="?" />
        </div>
      )}
    </span>
  );
}

function MatchFactorGroup({
  title,
  factors,
  tone,
  icon,
}: {
  title: string;
  factors: MatchFactor[];
  tone: "success" | "warning" | "neutral";
  icon: string;
}) {
  if (factors.length === 0) return null;
  const toneClass = tone === "success" ? "text-success-text" : tone === "warning" ? "text-warning-text" : "text-foreground-muted";

  return (
    <div className="mb-2 last:mb-0">
      <p className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest mb-1">{title}</p>
      <ul className="flex flex-col gap-1">
        {factors.map((factor) => (
          <li key={factor.code} className={`text-xs ${toneClass} flex gap-1.5`}>
            <span aria-hidden="true">{icon}</span>
            <span>{factor.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
