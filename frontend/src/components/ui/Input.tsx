import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export default function Input({ error, className = "", ...props }: InputProps) {
  const borderClasses = error
    ? "border-danger focus:border-danger focus:shadow-focus"
    : "border-input-border focus:border-input-border-focus focus:shadow-focus";

  return (
    <input
      className={`w-full bg-input-background border rounded-md px-4 py-3 text-sm text-foreground placeholder:text-muted transition-colors duration-150 focus:outline-none disabled:bg-surface disabled:text-foreground-disabled disabled:border-border ${borderClasses} ${className}`}
      aria-invalid={error}
      {...props}
    />
  );
}
