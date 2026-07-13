interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}

export default function FormField({
  label,
  htmlFor,
  required,
  error,
  children,
}: FormFieldProps) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-xs font-semibold text-foreground-secondary mb-1.5"
      >
        {label}
        {required && <span className="text-accent-text">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-danger-text mt-1">{error}</p>}
    </div>
  );
}
