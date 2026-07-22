import { describe, expect, it } from "vitest";
import {
  classifyLabelEvidence,
  extractLabelActivityStatus,
  extractLabelDemoPolicy,
  extractLabelDistributor,
  extractLabelRosterAudienceLevel,
  findMentionedSimilarArtists,
  isInternationallyOpen
} from "../src/labels/labelSignalExtraction.js";
import type { SimilarArtist } from "../src/schemas.js";

describe("classifyLabelEvidence", () => {
  it("classifies text with explicit record-label vocabulary as a label", () => {
    expect(classifyLabelEvidence("Independent label based in Lyon, roster of pop punk artists, catalogue of 30 releases")).toBe(true);
  });

  it("does not classify a bare 'label' mention without music-industry context", () => {
    expect(classifyLabelEvidence("Private label clothing store, family owned since 1990")).toBe(false);
  });

  it("classifies a generic 'label' keyword when surrounded by roster/catalogue context", () => {
    expect(classifyLabelEvidence("This label has signed several artists and released a growing catalogue of albums")).toBe(true);
  });
});

describe("extractLabelActivityStatus", () => {
  const now = new Date("2026-07-22T00:00:00Z");

  it("marks a label inactive on explicit closure language", () => {
    const status = extractLabelActivityStatus("The label ceased operations in 2019 and is no longer active.", now);
    expect(status.isActive).toBe(false);
  });

  it("marks a label active when a recent year is mentioned", () => {
    const status = extractLabelActivityStatus("Latest release came out in 2025 on the label.", now);
    expect(status.isActive).toBe(true);
  });

  it("leaves activity unknown when there is no evidence either way", () => {
    const status = extractLabelActivityStatus("An independent record label based in Lyon.", now);
    expect(status.isActive).toBeNull();
  });
});

describe("extractLabelDemoPolicy", () => {
  it("detects demo acceptance and only attaches a URL backed by a real link", () => {
    const policy = extractLabelDemoPolicy(
      "We accept demos from new artists, send us your demo via the link below.",
      ["https://example.test/demo-submission", "https://example.test/about"]
    );
    expect(policy.acceptsDemos).toBe(true);
    expect(policy.demoSubmissionUrl).toBe("https://example.test/demo-submission");
  });

  it("does not fabricate a demo link when acceptance is confirmed but no matching link exists", () => {
    const policy = extractLabelDemoPolicy("We accept demos from new artists.", ["https://example.test/about"]);
    expect(policy.acceptsDemos).toBe(true);
    expect(policy.demoSubmissionUrl).toBeNull();
  });

  it("detects explicit demo rejection", () => {
    const policy = extractLabelDemoPolicy("We do not accept demos at this time.", []);
    expect(policy.acceptsDemos).toBe(false);
    expect(policy.demoSubmissionUrl).toBeNull();
  });

  it("leaves demo policy unknown without evidence", () => {
    const policy = extractLabelDemoPolicy("An independent record label based in Lyon.", []);
    expect(policy.acceptsDemos).toBeNull();
  });
});

describe("extractLabelDistributor", () => {
  it("detects a known distributor name", () => {
    expect(extractLabelDistributor("Distributed worldwide via Believe.")).toBe("Believe");
  });

  it("returns null when no known distributor is mentioned", () => {
    expect(extractLabelDistributor("An independent record label based in Lyon.")).toBeNull();
  });
});

describe("extractLabelRosterAudienceLevel", () => {
  it("detects a large/major roster from explicit language", () => {
    expect(extractLabelRosterAudienceLevel("A major label with a global roster.", [])).toBe("large");
  });

  it("detects a small/DIY roster from explicit language", () => {
    expect(extractLabelRosterAudienceLevel("A DIY netlabel run from a bedroom studio.", [])).toBe("small");
  });

  it("falls back to a matched similar artist's tier when no explicit roster size language is present", () => {
    const similarArtist = baseSimilarArtist({ artistTier: "medium" });
    expect(extractLabelRosterAudienceLevel("Independent record label roster.", [similarArtist])).toBe("medium");
  });

  it("returns unknown when there is no signal at all", () => {
    expect(extractLabelRosterAudienceLevel("Independent record label.", [])).toBe("unknown");
  });
});

describe("isInternationallyOpen", () => {
  it("detects language indicating the label accepts artists from abroad", () => {
    expect(isInternationallyOpen("This label has a worldwide roster and accepts international artists.")).toBe(true);
  });

  it("returns false without international-openness language", () => {
    expect(isInternationallyOpen("An independent record label based in Lyon.")).toBe(false);
  });
});

describe("findMentionedSimilarArtists", () => {
  it("finds a similar artist mentioned in the source text", () => {
    const similarArtist = baseSimilarArtist({ name: "Thru It All" });
    const mentioned = findMentionedSimilarArtists("This label released the debut EP from Thru It All in 2024.", [similarArtist]);
    expect(mentioned).toHaveLength(1);
    expect(mentioned[0]!.name).toBe("Thru It All");
  });

  it("returns no matches when no similar artist is mentioned", () => {
    const similarArtist = baseSimilarArtist({ name: "Thru It All" });
    expect(findMentionedSimilarArtists("Independent record label based in Lyon.", [similarArtist])).toHaveLength(0);
  });
});

function baseSimilarArtist(overrides: Partial<SimilarArtist> = {}): SimilarArtist {
  return {
    name: "Comparable Punk Band",
    url: "https://example.test/comparable-punk-band",
    spotifyId: null,
    genres: ["pop punk", "punk rock"],
    city: "Paris",
    country: "France",
    source: "mock",
    sources: ["mock"],
    reason: "Comparable pop punk artist.",
    confidence: 0.9,
    artistTier: "small",
    bookingCategory: "local_peer",
    estimatedFollowers: 1500,
    estimatedPopularity: 18,
    sizeSignalSource: "manual",
    genreRelevance: 95,
    localRelevance: 80,
    sizeRelevance: 85,
    sceneRelevance: 80,
    totalRelevance: 90,
    relevanceToUserArtist: 90,
    possibleUse: "booking_research",
    estimatedLevel: "emerging",
    evidenceNotes: ["Strong genre compatibility."],
    sourceUrls: ["https://example.test/comparable-punk-band"],
    genreEvidence: [],
    locationEvidence: [],
    sizeEvidence: [],
    verificationStatus: "verified",
    popularity: {
      estimatedLevel: "small",
      confidence: 0.8,
      sizeSignalSource: "manual",
      platforms: {}
    },
    discardedTags: [],
    spotify: null,
    imageUrl: null,
    imageSource: null,
    imageConfidence: null,
    ...overrides
  };
}
