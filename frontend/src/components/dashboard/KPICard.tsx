import type { KpiMetric } from "@/types";

interface KpiCardProps {
  metric: KpiMetric;
}

export default function KpiCard({ metric }: KpiCardProps) {
  return (
    <div className="bg-card rounded-xl p-4 border border-white/8 shadow-card hover:bg-card-hover hover:border-white/12 transition-all duration-200 group">
      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 truncate">
        {metric.label}
      </p>
      <p className="text-2xl font-bold text-white tabular-nums">
        {metric.value}
        {metric.unit && (
          <span className="text-base text-gray-500 ml-1">{metric.unit}</span>
        )}
      </p>
    </div>
  );
}
