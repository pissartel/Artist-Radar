import { describe, expect, it, vi } from "vitest";
import type { GenericOpportunity, SimilarArtist } from "../src/schemas.js";
import { deduplicateIndustryOrganizations, normalizeIndustryDomain, normalizeIndustryName } from "../src/industry/normalization.js";
import { industryFreshnessScore, isIndustryDataUsable } from "../src/industry/freshness.js";
import { planIndustrySearch } from "../src/industry/searchPlanner.js";
import { IndustryExtractionResultSchema, } from "../src/industry/extraction.js";
import { scoreIndustryOrganization } from "../src/industry/scoring.js";
import { discoverIndustryOpportunities } from "../src/industry/discoverIndustryOpportunities.js";
import type { IndustryKnowledgeRepository, IndustryOrganization, IndustrySearchContext } from "../src/industry/types.js";

const now = "2026-09-12T10:00:00.000Z";
const similar = (name: string, score = 90) => ({ name, totalRelevance: score, genres: ["pop punk"] }) as SimilarArtist;
const context: IndustrySearchContext = { artistName: "Test Artist", country: "France", city: "Paris", genres: ["pop punk", "emo"], normalizedGenres: ["pop punk", "emo"], careerStage: "emerging", popularity: 20, similarArtists: [similar("Peer A", 95), similar("Peer B", 82)] };
const organization = (overrides: Partial<IndustryOrganization> = {}): IndustryOrganization => ({
  name: "Example Booking", normalizedName: "example", organizationType: "booking_agency", country: "France", city: "Paris",
  website: "https://example.test", genres: ["pop punk"], confidenceScore: .9, contacts: [],
  artistRelations: [{ artistName: "Peer A", relationshipType: "booking", active: true, sourceUrl: "https://example.test/roster", lastVerifiedAt: now }],
  sources: [{ url: "https://example.test/roster", sourceType: "official", confidence: .95, lastVerifiedAt: now }], lastVerifiedAt: now, ...overrides
});

describe("industry knowledge domain", () => {
  it("normalizes names/domains and deduplicates only compatible identities", () => {
    expect(normalizeIndustryName("BACÓ Booking SAS")).toBe("baco");
    expect(normalizeIndustryDomain("https://www.example.test/roster")).toBe("example.test");
    expect(deduplicateIndustryOrganizations([organization(), organization({ name: "Example Agency" })])).toHaveLength(1);
    expect(deduplicateIndustryOrganizations([organization(), organization({ organizationType: "label" })])).toHaveLength(2);
  });

  it("validates sourced extraction and rejects unsupported roster relations", () => {
    const valid = { organization: { name: "Example", type: "label" }, roster: [{ artistName: "Peer A", relationship: "label", sourceUrl: "https://example.test/release" }], contacts: [], evidence: [{ statement: "Credited on a release", sourceUrl: "https://example.test/release" }] };
    expect(IndustryExtractionResultSchema.parse(valid).roster).toHaveLength(1);
    expect(() => IndustryExtractionResultSchema.parse({ ...valid, evidence: [] })).toThrow();
  });

  it("plans bounded targeted searches from genres and strongest similar artists", () => {
    const queries = planIndustrySearch(context, { maxQueries: 8, maxSimilarArtists: 1 });
    expect(queries.length).toBeLessThanOrEqual(8);
    expect(queries).toContain("France pop punk booking agency");
    expect(queries.some((query) => query === '"Peer A" booking')).toBe(true);
  });

  it("makes sourced similar-artist overlap the strongest ranking signal", () => {
    const strong = scoreIndustryOrganization(organization(), context);
    const generic = scoreIndustryOrganization(organization({ name: "Generic", website: "https://generic.test", artistRelations: [], genres: ["pop punk", "emo"] }), context);
    expect(strong.score).toBeGreaterThan(generic.score);
    expect(strong.matchingArtists[0]?.name).toBe("Peer A");
    expect(strong.reasons.join(" ")).toContain("similar");
  });

  it("centralizes freshness boundaries", () => {
    const clock = new Date("2026-09-12T00:00:00Z");
    expect(industryFreshnessScore("2026-09-01T00:00:00Z", clock)).toBe(1);
    expect(isIndustryDataUsable("2026-05-01T00:00:00Z", clock)).toBe(false);
  });

  it("uses fresh high-quality persisted data without dynamic calls", async () => {
    const repository: IndustryKnowledgeRepository = { search: vi.fn().mockResolvedValue([organization(), organization({ name: "Second", website: "https://second.test" }), organization({ name: "Third", website: "https://third.test" })]), upsert: vi.fn() };
    const discover = vi.fn();
    const result = await discoverIndustryOpportunities(context, { repository, limit: 10, highQualityScore: 50, discover });
    expect(result.source).toBe("persistent"); expect(discover).not.toHaveBeenCalled(); expect(result.opportunities[0]?.organizationId).toBeDefined();
  });

  it("degrades to dynamic discovery, deduplicates, persists and maps to existing Opportunity", async () => {
    const opportunity = { id: "candidate", name: "Example Booking", opportunityType: "booking_agency", city: "Paris", country: "France", geographicScope: "national", websiteUrl: "https://example.test", sourceUrl: "https://example.test/roster", contactPageUrl: null, publicEmail: null, socialLinks: {}, associatedArtists: ["Peer A"], associatedGenres: ["pop punk"], audienceLevel: "small", status: "unknown", applicationUrl: null, sources: [{ name: "Official roster", url: "https://example.test/roster", confidence: .95 }], lastVerifiedAt: now, confidenceScore: .9, compatibilityScore: 90, compatibilityExplanation: "Represents Peer A", booker: { representedSimilarArtists: ["Peer A"], roster: ["Peer A"], bookerGenres: ["pop punk"], isActive: true } } as GenericOpportunity;
    const repository: IndustryKnowledgeRepository = { search: vi.fn().mockRejectedValue(new Error("offline")), upsert: vi.fn(async (items) => items.map((item) => ({ ...item, id: "org-1" }))) };
    const result = await discoverIndustryOpportunities(context, { repository, limit: 5, discover: async () => [[opportunity]] });
    expect(result.warnings).toContain("Persistent industry data unavailable; dynamic discovery continued.");
    expect(repository.upsert).toHaveBeenCalledOnce(); expect(result.opportunities[0]?.opportunityType).toBe("booking_agency"); expect(result.opportunities[0]?.organizationId).toBe("org-1");
  });
});
