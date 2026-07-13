import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export default function Card({ interactive, className = "", ...props }: CardProps) {
  const interactiveClasses = interactive
    ? "transition-all duration-200 hover:bg-surface-elevated hover:border-border-strong"
    : "";

  return (
    <div
      className={`bg-surface border border-border rounded-xl shadow-card ${interactiveClasses} ${className}`}
      {...props}
    />
  );
}
