import { productFeatures } from "@/lib/productFeatures";

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
      className="mb-6 rounded-xl border border-warning-tint bg-warning-tint p-4"
    >
      <p className="text-xs font-semibold text-warning-text uppercase tracking-widest mb-2">
        Heads up
      </p>
      {productFeatures.debugWarnings ? (
        <ul className="flex flex-col gap-1">
          {warnings.map((warning) => (
            <li key={warning} className="text-xs text-foreground-secondary leading-relaxed">
              {warning}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-foreground-secondary leading-relaxed">
          Some sources could not be checked during this analysis. Opportunity coverage may be
          incomplete.
        </p>
      )}
    </div>
  );
}
