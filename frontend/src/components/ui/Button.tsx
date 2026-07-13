import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

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
};

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
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-bold transition-all duration-150 focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
