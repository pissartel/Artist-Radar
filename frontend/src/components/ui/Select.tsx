import type { SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  /** Compact filter-pill sizing (auto width, small padding) instead of the
   *  full-width form-field sizing used by default. */
  dense?: boolean;
}

export default function Select({
  error,
  dense = false,
  className = "",
  children,
  ...props
}: SelectProps) {
  const borderClasses = error
    ? "border-danger focus:border-danger focus:shadow-focus"
    : "border-input-border hover:border-border-accent focus:border-input-border-focus focus:shadow-focus";

  const sizeClasses = dense
    ? "text-xs pl-3 pr-8 py-1.5 rounded-lg"
    : "w-full text-sm pl-4 pr-9 py-3 rounded-md";

  return (
    <div className={`relative ${dense ? "inline-block" : "block w-full"}`}>
      <select
        className={`appearance-none bg-input-background border text-foreground transition-colors duration-150 focus:outline-none disabled:bg-surface disabled:text-foreground-disabled disabled:border-border ${sizeClasses} ${borderClasses} ${className}`}
        aria-invalid={error}
        {...props}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-muted"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}
