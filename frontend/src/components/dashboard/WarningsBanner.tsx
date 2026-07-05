interface WarningsBannerProps {
  warnings: string[];
}

export default function WarningsBanner({ warnings }: WarningsBannerProps) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4"
    >
      <p className="text-xs font-semibold text-amber-300 uppercase tracking-widest mb-2">
        Heads up
      </p>
      <ul className="flex flex-col gap-1">
        {warnings.map((warning) => (
          <li key={warning} className="text-xs text-amber-200/90 leading-relaxed">
            {warning}
          </li>
        ))}
      </ul>
    </div>
  );
}
