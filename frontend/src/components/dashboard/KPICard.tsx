import type { KpiMetric } from "@/types";

interface KpiCardProps {
  metric: KpiMetric;
}

export default function KpiCard({ metric }: KpiCardProps) {
  return (
    <div className="bg-card rounded-lg p-5 border border-white/5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
        {metric.label}
      </p>
      <p className="text-3xl font-bold text-white">
        {metric.value}
        {metric.unit && (
          <span className="text-lg text-gray-400 ml-0.5">{metric.unit}</span>
        )}
      </p>
    </div>
  );
}
