import type { HTMLAttributes } from "react";

type BadgeVariant = "accent" | "success" | "warning" | "info" | "neutral";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  accent: "text-accent-text bg-accent-tint border-accent-tint",
  success: "text-success-text bg-success-tint border-success-tint",
  warning: "text-warning-text bg-warning-tint border-warning-tint",
  info: "text-info-text bg-info-tint border-info-tint",
  neutral: "text-foreground-muted bg-surface-elevated border-border",
};

export default function Badge({
  variant = "neutral",
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
