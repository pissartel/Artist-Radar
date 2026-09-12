import type { GenericOpportunity } from "../schemas.js";
import { debugLog, warnLog } from "../utils/logger.js";
import { deduplicateIndustryOrganizations } from "./normalization.js";
import { industryMatchToOpportunity, opportunityToIndustryOrganization } from "./mapping.js";
import { isIndustryDataUsable } from "./freshness.js";
import { scoreIndustryOrganization } from "./scoring.js";
import { IndustryOrganizationSchema, type IndustryDiscoveryResult, type IndustryKnowledgeRepository, type IndustrySearchContext } from "./types.js";

export interface DiscoverIndustryOptions {
  repository?: IndustryKnowledgeRepository;
  limit: number;
  minimumHighQualityResults?: number;
  highQualityScore?: number;
  discover: () => Promise<GenericOpportunity[][]>;
}

export async function discoverIndustryOpportunities(context: IndustrySearchContext, options: DiscoverIndustryOptions): Promise<IndustryDiscoveryResult> {
  const warnings: string[] = [];
  let existing = [] as ReturnType<typeof IndustryOrganizationSchema.parse>[];
  if (options.repository) {
    try { existing = (await options.repository.search(context, options.limit * 2)).map((item) => IndustryOrganizationSchema.parse(item)); }
    catch (error) { warnings.push("Persistent industry data unavailable; dynamic discovery continued."); warnLog("industry", "repository search failed", { error }); }
  }
  const rankedExisting = existing.map((org) => scoreIndustryOrganization(org, context)).sort((a, b) => b.score - a.score);
  const enough = rankedExisting.filter((match) => match.score >= (options.highQualityScore ?? 70) && isIndustryDataUsable(match.organization.lastVerifiedAt)).length >= (options.minimumHighQualityResults ?? 3);
  debugLog("industry", "persistent candidates ranked", { count: existing.length, highQualityCount: rankedExisting.filter((m) => m.score >= (options.highQualityScore ?? 70)).length, dynamicRequired: !enough });
  if (enough) return { opportunities: rankedExisting.slice(0, options.limit).map(industryMatchToOpportunity), organizations: existing, source: "persistent", warnings };

  let discovered: GenericOpportunity[] = [];
  try { discovered = (await options.discover()).flat(); }
  catch (error) { warnings.push("Dynamic industry discovery failed; persistent matches were returned."); warnLog("industry", "dynamic discovery failed", { error }); }
  const converted = discovered.flatMap((opportunity) => {
    try { return [IndustryOrganizationSchema.parse(opportunityToIndustryOrganization(opportunity))]; }
    catch (error) { debugLog("industry", "rejected malformed discovered organization", { opportunityId: opportunity.id, error }); return []; }
  });
  let merged = deduplicateIndustryOrganizations([...existing, ...converted]);
  if (options.repository && converted.length) {
    try { merged = deduplicateIndustryOrganizations([...existing, ...await options.repository.upsert(converted)]); }
    catch (error) { warnings.push("New industry data could not be persisted."); warnLog("industry", "repository upsert failed", { error }); }
  }
  const opportunities = merged.map((org) => scoreIndustryOrganization(org, context)).sort((a, b) => b.score - a.score).slice(0, options.limit).map(industryMatchToOpportunity);
  debugLog("industry", "industry discovery summary", { existing: existing.length, discovered: converted.length, deduplicated: merged.length, returned: opportunities.length });
  return { opportunities, organizations: merged, source: existing.length ? "persistent_and_dynamic" : "dynamic", warnings };
}
