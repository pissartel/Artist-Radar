import Link from "next/link";
import Badge from "@/components/ui/Badge";
import type { ManagerOpportunity } from "@/types";
import ManagerOpportunityCard from "./ManagerOpportunityCard";

export default function ManagerOpportunitiesSection({ managers }: { managers: ManagerOpportunity[] }) {
  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground">Managers</h2>
          <Badge variant="accent" className="tabular-nums">{managers.length}</Badge>
        </div>
        <Link href="/managers" className="text-xs text-accent-text transition-colors hover:text-foreground">
          Explore managers
        </Link>
      </div>

      {managers.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {managers.slice(0, 3).map((manager) => <ManagerOpportunityCard key={manager.id} manager={manager} />)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-5 text-sm text-foreground-muted shadow-card-glow">
          No manager with verified professional activity was found in the lightweight search. You can launch a deeper search from the Managers page.
        </div>
      )}
    </section>
  );
}
