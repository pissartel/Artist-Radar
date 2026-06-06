import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOutputBaseName,
  exportOpportunities,
  opportunitiesToCsv,
  similarArtistsToCsv
} from "../src/services/exportService.js";
import type { OpportunitySearchRunResult } from "../src/pipeline.js";
import type { ArtistInput, Opportunity, SimilarArtist } from "../src/schemas.js";

const input: ArtistInput = {
  mode: "booking",
  artist: "Fake Band",
  city: "Lyon",
  genre: "metalcore",
  target: null,
  links: [],
  limit: 1
};

const opportunities: Opportunity[] = [
  {
    name: "Sample Venue",
    type: "venue",
    city: "Lyon",
    country: "France",
    source_url: null,
    contact: null,
    reason: "Fits the artist genre and city.",
    score: 82,
    suggested_message: "Hello, I would like to introduce Fake Band for a possible show."
  }
];

const similarArtists: SimilarArtist[] = [
  {
    name: "Sample Similar Band",
    url: null,
    genres: ["metalcore"],
    city: "Lyon",
    country: "France",
    source: "mock",
    reason: "Similar size and genre.",
    confidence: 0.7,
    artistTier: "small",
    estimatedFollowers: 900,
    estimatedPopularity: 14,
    relevanceToUserArtist: "Shares genre and city with the artist profile.",
    possibleUse: "co_bill",
    estimatedLevel: "emerging"
  }
];

const result: OpportunitySearchRunResult = {
  artistProfile: {
    artistName: "Fake Band",
    city: "Lyon",
    country: "France",
    genres: ["metalcore"],
    socialLinks: {},
    platformStats: {},
    estimatedLevel: "unknown",
    confidence: 0.2,
    notes: ["Test profile."]
  },
  similarArtists,
  similarArtistsByTier: {
    small: similarArtists,
    medium: [],
    large: [],
    unknown: []
  },
  opportunities
};

describe("export utilities", () => {
  it("builds stable output base names", () => {
    const name = buildOutputBaseName(input, new Date("2026-06-06T10:00:00.000Z"));
    expect(name).toBe("booking-fake-band-lyon-2026-06-06T10-00-00-000Z");
  });

  it("converts opportunities to CSV", () => {
    const csv = opportunitiesToCsv(opportunities);
    expect(csv).toContain('"name","type","city","country","source_url","contact","reason","score","suggested_message"');
    expect(csv).toContain("Sample Venue");
  });

  it("exports CSV headers for empty opportunity lists", () => {
    const csv = opportunitiesToCsv([]);
    expect(csv).toBe('"name","type","city","country","source_url","contact","reason","score","suggested_message"');
  });

  it("converts similar artists to CSV", () => {
    const csv = similarArtistsToCsv(similarArtists);
    expect(csv).toContain('"name","url","genres","city","country","source"');
    expect(csv).toContain("Sample Similar Band");
    expect(csv).toContain("co_bill");
  });

  it("exports JSON, opportunities CSV and similar artists CSV files", async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "artist-radar-"));
    const paths = await exportOpportunities(input, result, outputDir);

    const json = await readFile(paths.jsonPath, "utf8");
    const csv = await readFile(paths.opportunitiesCsvPath, "utf8");
    const similarArtistsCsv = await readFile(paths.similarArtistsCsvPath, "utf8");
    const parsed = JSON.parse(json) as OpportunitySearchRunResult;

    expect(parsed.artistProfile.artistName).toBe("Fake Band");
    expect(parsed.similarArtistsByTier.small).toHaveLength(1);
    expect(parsed.opportunities).toHaveLength(1);
    expect(csv).toContain("Sample Venue");
    expect(similarArtistsCsv).toContain("Sample Similar Band");
    expect(paths.csvPath).toBe(paths.opportunitiesCsvPath);
  });
});
