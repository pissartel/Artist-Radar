import type { KPICard as KPICardType } from "@/types";

interface KPICardProps {
  card: KPICardType;
}

export default function KPICard({ card }: KPICardProps) {
  return (
    <div className="bg-card rounded-lg p-5 border border-white/5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
        {card.label}
      </p>
      <p className="text-3xl font-bold text-white">{card.value}</p>
    </div>
  );
}
