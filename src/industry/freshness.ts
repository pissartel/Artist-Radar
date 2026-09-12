export interface IndustryFreshnessPolicy { freshDays: number; usableDays: number; }
export const DEFAULT_INDUSTRY_FRESHNESS_POLICY: IndustryFreshnessPolicy = { freshDays: 30, usableDays: 90 };

export function industryFreshnessScore(lastVerifiedAt: string | null | undefined, now = new Date(), policy = DEFAULT_INDUSTRY_FRESHNESS_POLICY): number {
  if (!lastVerifiedAt) return 0.25;
  const ageDays = Math.max(0, (now.getTime() - new Date(lastVerifiedAt).getTime()) / 86_400_000);
  if (!Number.isFinite(ageDays)) return 0.25;
  if (ageDays <= policy.freshDays) return 1;
  if (ageDays <= policy.usableDays) return 0.65;
  return 0.2;
}

export function isIndustryDataUsable(lastVerifiedAt: string | null | undefined, now = new Date(), policy = DEFAULT_INDUSTRY_FRESHNESS_POLICY): boolean {
  if (!lastVerifiedAt) return false;
  return (now.getTime() - new Date(lastVerifiedAt).getTime()) / 86_400_000 <= policy.usableDays;
}
