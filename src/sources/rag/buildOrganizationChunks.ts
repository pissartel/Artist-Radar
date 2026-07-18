import { buildChunkId, chunkText, type ChunkTextOptions } from "../../knowledge/chunkText.js";
import type { MergedOrganization, OrganizationSourceRecord } from "../organization.schema.js";
import { parseOrganizationChunk, type OrganizationChunk } from "./organizationChunk.schema.js";

/**
 * Builds indexable, citable chunks for every source record backing a merged
 * organization (issue #127): description, submission-relevant notes, roster,
 * genre statements, geographic coverage, services and page excerpts. Each
 * chunk keeps the originating source's own URL, so a claim always traces
 * back to the exact document it was extracted from.
 */
export function buildOrganizationChunks(
  organization: MergedOrganization,
  options: ChunkTextOptions = {}
): OrganizationChunk[] {
  const createdAt = new Date().toISOString();
  const chunks: OrganizationChunk[] = [];

  for (const record of organization.sources) {
    const documentKey = `${organization.id}:${record.sourceUrl}`;
    const texts = chunkText(buildSourceRecordText(record), options);

    texts.forEach((text, index) => {
      chunks.push(
        parseOrganizationChunk({
          id: buildChunkId(documentKey, index, text),
          organizationId: organization.id,
          organizationName: organization.name,
          opportunityType: record.organizationType,
          country: record.country ?? organization.country,
          city: record.city ?? organization.city,
          genres: record.genres,
          sourceDomain: extractSourceDomain(record.sourceUrl),
          sourceUrl: record.sourceUrl,
          lastVerifiedAt: record.extractedAt,
          confidenceScore: record.reliabilityScore,
          text,
          createdAt
        })
      );
    });
  }

  return chunks;
}

function buildSourceRecordText(record: OrganizationSourceRecord): string {
  const lines: string[] = [`${record.name} is listed as a ${record.organizationType.toLowerCase()} in the music industry.`];

  const location = [record.city, record.country].filter((value): value is string => Boolean(value)).join(", ");
  if (location) {
    lines.push(`Based in ${location}.`);
  }
  if (record.territories.length > 0) {
    lines.push(`Geographic coverage: ${record.territories.join(", ")}.`);
  }
  if (record.genres.length > 0) {
    lines.push(`Genre focus: ${record.genres.join(", ")}.`);
  }
  if (record.services.length > 0) {
    lines.push(`Services offered: ${record.services.join(", ")}.`);
  }
  if (record.relatedOrganizations.length > 0) {
    lines.push(`Roster / related organizations: ${record.relatedOrganizations.join(", ")}.`);
  }
  if (record.evidence.length > 0) {
    lines.push(`Evidence from the official page: ${record.evidence.join(" ")}`);
  }
  if (record.notes) {
    lines.push(`Notes: ${record.notes}`);
  }

  return lines.join("\n");
}

function extractSourceDomain(sourceUrl: string): string {
  return new URL(sourceUrl).hostname.replace(/^www\./, "");
}
