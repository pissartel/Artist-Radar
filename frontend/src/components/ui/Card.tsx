import type { HTMLAttributes } from "react";

export type CardVariant = "stat" | "interactive" | "selected";

const CARD_BASE = "bg-surface border rounded-xl shadow-card p-4";

// Single source of truth for every "artist data" (KPI tile), Similar Artist,
// and Opportunity card in the app — they must all share background, border,
// radius, shadow, and spacing, differing only by interaction state.
//   - stat: non-interactive resting look (KPI tiles, info panels).
//   - interactive: clickable cards (Similar Artist, Opportunity) — subtle
//     neutral border at rest, restrained purple-accent border/surface/shadow
//     on hover or keyboard focus. Never a permanently purple or white border.
//   - selected: a currently open/selected card — a clearer, solid accent
//     border so it reads as distinct from a plain hover state.
const VARIANT_CLASSES: Record<CardVariant, string> = {
  stat: "border-border",
  interactive:
    "border-border transition-all duration-200 hover:bg-surface-elevated hover:border-border-accent hover:shadow-card-hover focus-visible:outline-none focus-visible:bg-surface-elevated focus-visible:border-border-accent focus-visible:shadow-focus",
  selected: "border-border-accent-hover bg-surface-elevated shadow-card-hover focus-visible:outline-none focus-visible:shadow-focus",
};

/** Composes the shared card look for elements that can't render <Card> directly (e.g. a Next.js <Link>). */
export function cardClassName(variant: CardVariant = "stat", className = "") {
  return `${CARD_BASE} ${VARIANT_CLASSES[variant]} ${className}`.trim();
}

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

export default function Card({ variant = "stat", className = "", ...props }: CardProps) {
  return <div className={cardClassName(variant, className)} {...props} />;
}
