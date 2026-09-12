import { GenericOpportunitySchema, type GenericOpportunity } from "../schemas.js";
import { normalizeIndustryName } from "./normalization.js";
import type { IndustryMatch } from "./scoring.js";
import type { IndustryOrganization, IndustryOrganizationType } from "./types.js";

const relationByType: Record<IndustryOrganizationType, "booking" | "management" | "label"> = {
  booker: "booking", booking_agency: "booking", promoter: "booking",
  manager: "management", management_company: "management", label: "label"
};

export function opportunityToIndustryOrganization(opportunity: GenericOpportunity, now = new Date()): IndustryOrganization {
  const type = opportunity.opportunityType as IndustryOrganizationType;
  const represented = opportunity.booker?.representedSimilarArtists ?? opportunity.manager?.relevantArtists ?? opportunity.label?.signedArtists ?? [];
  const sourceUrls = opportunity.sources.flatMap((source) => source.url ? [source.url] : []);
  const fallbackSource = opportunity.sourceUrl ?? opportunity.websiteUrl;
  const sources = [...new Set([...sourceUrls, ...(fallbackSource ? [fallbackSource] : [])])].map((url) => ({
    url, title: opportunity.name, sourceType: "web_search" as const,
    confidence: opportunity.sources.find((source) => source.url === url)?.confidence ?? opportunity.confidenceScore,
    lastVerifiedAt: opportunity.lastVerifiedAt ?? now.toISOString()
  }));
  if (!sources.length) throw new Error(`Industry opportunity ${opportunity.id} has no source URL`);
  return {
    id: opportunity.organizationId ?? undefined,
    name: opportunity.name,
    normalizedName: normalizeIndustryName(opportunity.name),
    organizationType: type,
    country: opportunity.country, city: opportunity.city, website: opportunity.websiteUrl,
    instagram: opportunity.socialLinks.instagramUrl,
    genres: opportunity.associatedGenres,
    submissionUrl: opportunity.applicationUrl ?? opportunity.booker?.submissionUrl ?? opportunity.label?.demoSubmissionUrl,
    confidenceScore: opportunity.confidenceScore,
    contacts: opportunity.publicEmail ? [{ email: opportunity.publicEmail, sourceUrl: opportunity.contactPageUrl ?? fallbackSource!, lastVerifiedAt: opportunity.lastVerifiedAt ?? now.toISOString() }] : [],
    artistRelations: represented.flatMap((artistName) => fallbackSource ? [{ artistName, relationshipType: relationByType[type], active: null, sourceUrl: fallbackSource, lastVerifiedAt: opportunity.lastVerifiedAt ?? now.toISOString() }] : []),
    sources,
    firstSeenAt: now.toISOString(), lastSeenAt: now.toISOString(), lastVerifiedAt: opportunity.lastVerifiedAt ?? now.toISOString()
  };
}

export function industryMatchToOpportunity(match: IndustryMatch): GenericOpportunity {
  const org = match.organization;
  const sourceUrl = org.sources[0]?.url ?? org.website ?? null;
  const represented = match.matchingArtists.map((artist) => artist.name);
  const base = {
    id: `industry-${org.id ?? `${org.organizationType}-${normalizeIndustryName(org.name).replace(/\s+/g, "-")}`}`,
    organizationId: org.id ?? null,
    name: org.name, opportunityType: org.organizationType,
    shortDescription: `${org.name} is a ${org.organizationType.replaceAll("_", " ")} matched from sourced industry data.`,
    city: org.city, country: org.country, geographicScope: "unknown" as const,
    websiteUrl: org.website, sourceUrl, publicEmail: org.contacts[0]?.email ?? null,
    contactPageUrl: org.contacts[0]?.publicProfileUrl ?? null,
    socialLinks: { instagramUrl: org.instagram ?? null },
    associatedArtists: org.artistRelations.map((relation) => relation.artistName),
    matchingArtists: match.matchingArtists,
    associatedGenres: org.genres, audienceLevel: "unknown" as const, status: "unknown" as const,
    applicationUrl: org.submissionUrl,
    sources: org.sources.map((source) => ({ name: source.title ?? org.name, url: source.url, confidence: source.confidence })),
    lastVerifiedAt: org.lastVerifiedAt, confidenceScore: org.confidenceScore,
    compatibilityScore: match.score, compatibilityExplanation: match.reasons.join(" ")
  };
  if (["booker", "booking_agency", "promoter"].includes(org.organizationType)) {
    return GenericOpportunitySchema.parse({ ...base, booker: { representedSimilarArtists: represented, roster: org.artistRelations.map((r) => r.artistName), bookerGenres: org.genres, submissionUrl: org.submissionUrl, isActive: null } });
  }
  if (["manager", "management_company"].includes(org.organizationType)) {
    const evidence = org.artistRelations.length
      ? org.artistRelations.map((r) => ({ sourceUrl: r.sourceUrl, similarArtistName: r.artistName, relationshipStatus: "unknown" as const, confidence: org.confidenceScore }))
      : [{ sourceUrl, relationshipStatus: "unknown" as const, confidence: org.confidenceScore }];
    return GenericOpportunitySchema.parse({ ...base, manager: { roster: org.artistRelations.map((r) => r.artistName), relevantArtists: represented, managerGenres: org.genres, relationshipStatus: "unknown", evidence } });
  }
  return GenericOpportunitySchema.parse({ ...base, label: { signedArtists: org.artistRelations.map((r) => r.artistName), labelGenres: org.genres, demoSubmissionUrl: org.submissionUrl, evidence: org.artistRelations.map((r) => ({ provider: "web_search", sourceUrl: r.sourceUrl, similarArtistName: r.artistName, confidence: org.confidenceScore })) } });
}
