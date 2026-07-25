import { describe, expect, it } from "vitest";
import {
  classifyBookerEntityType,
  extractBookerActivityStatus,
  extractBookerAudienceLevel,
  extractBookerRoster,
  extractBookerSubmissionPolicy,
  findMentionedSimilarArtists,
  hasVenueNetworkEvidence,
  isInternationallyOpen,
  worksWithEmergingActs
} from "../src/bookers/bookerSignalExtraction.js";
import type { SimilarArtist } from "../src/schemas.js";

describe("classifyBookerEntityType", () => {
  it("classifies a booking agency backed by roster evidence", () => {
    expect(
      classifyBookerEntityType("Independent booking agency representing a roster of pop punk artists across Europe.")
    ).toBe("booking_agency");
  });

  it("classifies an independent promoter backed by concert-organizing evidence", () => {
    expect(
      classifyBookerEntityType("Independent promoter that organizes concerts for touring pop punk bands every month.")
    ).toBe("promoter");
  });

  it("distinguishes an independent promoter from a booking agency", () => {
    const promoter = classifyBookerEntityType("Independent promoter, organizes concerts across the region.");
    const agency = classifyBookerEntityType("Booking agency representing a roster of touring artists.");
    expect(promoter).toBe("promoter");
    expect(agency).toBe("booking_agency");
    expect(promoter).not.toBe(agency);
  });

  it("classifies an individual booker backed by booking-for evidence", () => {
    expect(
      classifyBookerEntityType("Freelance booker for several emerging pop punk bands, booking for European tours.")
    ).toBe("booker");
  });

  it("does not classify a bare 'agency' or 'booker' mention without representation/booking evidence", () => {
    expect(classifyBookerEntityType("A generic booking agency website with no further details.")).toBeNull();
  });
});

describe("extractBookerActivityStatus", () => {
  const now = new Date("2026-07-25T00:00:00Z");

  it("marks a booker/agency/promoter inactive on explicit closure language", () => {
    const status = extractBookerActivityStatus("This booking agency ceased operations in 2019 and is no longer active.", now);
    expect(status.isActive).toBe(false);
  });

  it("marks activity as active when a recent year is mentioned", () => {
    const status = extractBookerActivityStatus("Latest tour booked in 2025 by this agency.", now);
    expect(status.isActive).toBe(true);
  });

  it("leaves activity unknown when there is no evidence either way", () => {
    const status = extractBookerActivityStatus("An independent booking agency based in Lyon.", now);
    expect(status.isActive).toBeNull();
  });
});

describe("extractBookerSubmissionPolicy", () => {
  it("detects submission acceptance and only attaches a URL backed by a real link", () => {
    const policy = extractBookerSubmissionPolicy(
      "We are now accepting new artists, submit your music via the link below.",
      ["https://example.test/submit-your-artist", "https://example.test/about"]
    );
    expect(policy.acceptsSubmissions).toBe(true);
    expect(policy.submissionUrl).toBe("https://example.test/submit-your-artist");
  });

  it("does not fabricate a submission link when acceptance is confirmed but no matching link exists", () => {
    const policy = extractBookerSubmissionPolicy("Now accepting new artists.", ["https://example.test/about"]);
    expect(policy.acceptsSubmissions).toBe(true);
    expect(policy.submissionUrl).toBeNull();
  });

  it("detects explicit submission rejection", () => {
    const policy = extractBookerSubmissionPolicy("Our roster is full, not currently accepting new artists.", []);
    expect(policy.acceptsSubmissions).toBe(false);
    expect(policy.submissionUrl).toBeNull();
  });

  it("leaves submission policy unknown without evidence", () => {
    const policy = extractBookerSubmissionPolicy("An independent booking agency based in Lyon.", []);
    expect(policy.acceptsSubmissions).toBeNull();
  });
});

describe("extractBookerRoster", () => {
  it("extracts a roster listed explicitly by the source", () => {
    const roster = extractBookerRoster("Roster: Thru It All, Comparable Punk Band, Another Act.");
    expect(roster).toEqual(["Thru It All", "Comparable Punk Band", "Another Act"]);
  });

  it("returns an empty roster when the source has no explicit listing", () => {
    expect(extractBookerRoster("An independent booking agency based in Lyon.")).toEqual([]);
  });
});

describe("extractBookerAudienceLevel", () => {
  it("detects a large/major agency from explicit language", () => {
    expect(extractBookerAudienceLevel("A major agency with a global roster.", [])).toBe("large");
  });

  it("detects a small/boutique agency from explicit language", () => {
    expect(extractBookerAudienceLevel("A boutique agency run by one person.", [])).toBe("small");
  });

  it("falls back to a matched similar artist's tier when no explicit size language is present", () => {
    const similarArtist = baseSimilarArtist({ artistTier: "medium" });
    expect(extractBookerAudienceLevel("Independent booking agency roster.", [similarArtist])).toBe("medium");
  });

  it("returns unknown when there is no signal at all", () => {
    expect(extractBookerAudienceLevel("Independent booking agency.", [])).toBe("unknown");
  });
});

describe("isInternationallyOpen", () => {
  it("detects language indicating the booker accepts artists from abroad", () => {
    expect(isInternationallyOpen("This agency has a worldwide roster and accepts international artists.")).toBe(true);
  });

  it("returns false without international-openness language", () => {
    expect(isInternationallyOpen("An independent booking agency based in Lyon.")).toBe(false);
  });
});

describe("hasVenueNetworkEvidence", () => {
  it("detects venue-network language", () => {
    expect(hasVenueNetworkEvidence("This promoter has a strong network of venues across the region.")).toBe(true);
  });

  it("returns false without venue-network language", () => {
    expect(hasVenueNetworkEvidence("An independent booking agency based in Lyon.")).toBe(false);
  });
});

describe("worksWithEmergingActs", () => {
  it("detects development-stage language", () => {
    expect(worksWithEmergingActs("This agency focuses on developing emerging artists.")).toBe(true);
  });

  it("returns false without development-stage language", () => {
    expect(worksWithEmergingActs("An independent booking agency based in Lyon.")).toBe(false);
  });
});

describe("findMentionedSimilarArtists", () => {
  it("finds a similar artist mentioned in the source text", () => {
    const similarArtist = baseSimilarArtist({ name: "Thru It All" });
    const mentioned = findMentionedSimilarArtists("This agency represents Thru It All across Europe.", [similarArtist]);
    expect(mentioned).toHaveLength(1);
    expect(mentioned[0]!.name).toBe("Thru It All");
  });

  it("returns no matches when no similar artist is mentioned", () => {
    const similarArtist = baseSimilarArtist({ name: "Thru It All" });
    expect(findMentionedSimilarArtists("Independent booking agency based in Lyon.", [similarArtist])).toHaveLength(0);
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
