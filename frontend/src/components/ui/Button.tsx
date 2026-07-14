import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "gradient";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active disabled:bg-secondary disabled:text-foreground-disabled",
  secondary:
    "bg-secondary text-secondary-foreground border border-border-strong hover:bg-secondary-hover active:bg-surface disabled:bg-surface disabled:text-foreground-disabled disabled:border-border",
  ghost:
    "bg-transparent text-foreground-secondary border border-border-subtle hover:border-border-strong hover:text-foreground active:bg-surface disabled:text-foreground-disabled disabled:border-border",
  // Reserved for primary CTAs — the same brand gradient as the NextStage logo mark.
  gradient:
    "bg-gradient-brand text-white hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:brightness-100",
};

/** Composes the shared button look for elements that can't render <Button> directly (e.g. a Next.js <Link>). */
export function buttonClassName(variant: ButtonVariant = "primary", className = "") {
  return `inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-bold transition-all duration-150 focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${className}`.trim();
}

export default function Button({
  variant = "primary",
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={buttonClassName(variant, className)}
      {...props}
    />
  );
}
