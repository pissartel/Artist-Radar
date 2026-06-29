import type { KpiMetric } from "@/types";
import KpiCard from "./KPICard";

interface KpiGridProps {
  metrics: KpiMetric[];
}

export default function KpiGrid({ metrics }: KpiGridProps) {
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {metrics.map((metric) => (
        <KpiCard key={metric.id} metric={metric} />
      ))}
    </section>
  );
}
