import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    spotifyUrl: null,
    spotifyId: null,
    instagramUrl: null,
    instagramHandle: null,
    youtubeUrl: null,
    genres: ["metalcore"],
    city: "Lyon",
    country: "France",
    source: "mock",
    sources: ["mock"],
    reason: "Similar size and genre.",
    confidence: 0.7,
    artistTier: "small",
    bookingCategory: "local_peer",
    estimatedFollowers: 900,
    estimatedPopularity: 14,
    topTrackPopularityMax: null,
    topTrackPopularityAvg: null,
    topTrackCount: null,
    sizeSignalSource: "manual",
    genreRelevance: 90,
    localRelevance: 90,
    sizeRelevance: 80,
    sceneRelevance: 90,
    totalRelevance: 86,
    relevanceToUserArtist: 82,
    possibleUse: "co_bill",
    estimatedLevel: "emerging",
    evidenceNotes: ["Similar size and genre."],
    sourceUrls: [],
    genreEvidence: [{ source: "mock", genres: ["metalcore"], confidence: 0.9 }],
    locationEvidence: [],
    sizeEvidence: [
      { source: "youtube", subscribers: 1200, views: 90000, confidence: 0.8, sourceUrl: "https://www.youtube.com/@sample" },
      { source: "lastfm", followers: 800, views: 4000, confidence: 0.45, sourceUrl: "https://www.last.fm/music/sample" }
    ],
    verificationStatus: "verified",
    popularity: {
      estimatedLevel: "small",
      confidence: 0.75,
      sizeSignalSource: "mixed",
      platforms: {
        instagram: { followers: 1000, sourceUrl: "https://www.instagram.com/sample/" },
        youtube: { subscribers: 1200, views: 90000, videos: 12, sourceUrl: "https://www.youtube.com/@sample" },
        spotify: { followers: null, popularity: 14, sourceUrl: null },
        lastfm: { listeners: 800, playcount: 4000, sourceUrl: "https://www.last.fm/music/sample" }
      }
    },
    discardedTags: ["singer"]
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
  similarArtists: {
    local_peer: similarArtists,
    regional_peer: [],
    support_target: [],
    reference: [],
    to_verify: [],
    unknown: []
  },
  venueCandidates: [],
  eventCandidates: [
    {
      name: "Sample Event",
      date: null,
      venueName: "Sample Venue",
      city: "Lyon",
      country: "France",
      region: "Auvergne-Rhone-Alpes",
      lineup: [],
      lineupStatus: "support_not_announced",
      sourceUrl: null,
      ticketUrl: null,
      description: "Potential support slot research candidate; not confirmed.",
      confidence: 0.6
    }
  ],
  opportunities
};

describe("export utilities", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
    expect(csv).toContain('"name","bookingCategory","possibleUse","genres","city","country","estimatedLevel","popularityConfidence","instagramFollowers","youtubeSubscribers","youtubeViews","spotifyFollowers","spotifyPopularity","lastfmListeners","lastfmPlaycount","spotifyUrl","instagramUrl","youtubeUrl","verificationStatus","totalRelevance","genreRelevance","localRelevance","sizeRelevance","sources","sourceUrls","reason"');
    expect(csv).toContain("Sample Similar Band");
    expect(csv).toContain("co_bill");
    expect(csv).toContain("1200");
    expect(csv).toContain("90000");
    expect(csv).toContain("800");
  });

  it("exports JSON, opportunities CSV, similar artists CSV and events CSV files", async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "artist-radar-"));
    const paths = await exportOpportunities(input, result, outputDir);

    const json = await readFile(paths.jsonPath, "utf8");
    const csv = await readFile(paths.opportunitiesCsvPath, "utf8");
    const similarArtistsCsv = await readFile(paths.similarArtistsCsvPath, "utf8");
    const eventsCsv = await readFile(paths.eventsCsvPath, "utf8");
    const parsed = JSON.parse(json) as OpportunitySearchRunResult;

    expect(parsed.artistProfile.artistName).toBe("Fake Band");
    expect(parsed.similarArtists.local_peer).toHaveLength(1);
    expect(parsed).not.toHaveProperty("similarArtistsByTier");
    expect(parsed.opportunities).toHaveLength(1);
    expect(parsed.eventCandidates).toHaveLength(1);
    expect(csv).toContain("Sample Venue");
    expect(similarArtistsCsv).toContain("Sample Similar Band");
    expect(eventsCsv).toContain("Sample Event");
    expect(paths.csvPath).toBe(paths.opportunitiesCsvPath);
  });

  it("excludes raw evidence from final JSON by default", async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "artist-radar-"));
    const paths = await exportOpportunities(input, result, outputDir);
    const parsed = JSON.parse(await readFile(paths.jsonPath, "utf8")) as Record<string, any>;
    const artist = parsed.similarArtists.local_peer[0];

    expect(artist.genreEvidence).toBeUndefined();
    expect(artist.locationEvidence).toBeUndefined();
    expect(artist.sizeEvidence).toBeUndefined();
    expect(artist.discardedTags).toBeUndefined();
    expect(artist.popularity.platforms.instagram.followers).toBe(1000);
  });

  it("includes debug evidence when EXPORT_DEBUG_EVIDENCE=true", async () => {
    vi.stubEnv("EXPORT_DEBUG_EVIDENCE", "true");
    const outputDir = await mkdtemp(path.join(tmpdir(), "artist-radar-"));
    const paths = await exportOpportunities(input, result, outputDir);
    const parsed = JSON.parse(await readFile(paths.jsonPath, "utf8")) as Record<string, any>;
    const artist = parsed.similarArtists.local_peer[0];

    expect(artist.genreEvidence).toHaveLength(1);
    expect(artist.sizeEvidence).toHaveLength(2);
    expect(artist.discardedTags).toEqual(["singer"]);
  });
});
