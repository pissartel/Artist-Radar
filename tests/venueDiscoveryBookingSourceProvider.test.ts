import { describe, expect, it } from "vitest";
import {
  buildSimilarArtistVenueQueries,
  buildVenueDiscoveryBookingSourceProvider,
  buildVenueDiscoveryQueries,
  classifyVenueDiscoveryCategory
} from "../src/booking/providers/VenueDiscoveryBookingSourceProvider.js";
import { isEvergreenOrganizationCategory } from "../src/booking/relevance.js";
import { searchBookingOpportunities } from "../src/booking/searchBookingOpportunities.js";
import type { BookingSearchInput } from "../src/booking/types.js";
import type { SimilarArtist } from "../src/schemas.js";

const input: BookingSearchInput = {
  artist: "Tuesday Fall",
  city: "Paris",
  genre: "pop punk",
  target: "France",
  links: [],
  limit: 5,
  artistProfile: {
    artistName: "Tuesday Fall",
    city: "Paris",
    country: "France",
    genres: ["pop punk"],
    spotifyArtistName: null,
    spotifyGenres: [],
    socialLinks: {},
    platformStats: {},
    estimatedLevel: "emerging",
    confidence: 0.7,
    notes: []
  }
};

describe("buildVenueDiscoveryQueries", () => {
  it("generates venue/organization-focused queries covering SMACs, bars, associations, clubs and collectives", () => {
    const queries = buildVenueDiscoveryQueries("pop punk", "Paris", "France").join(" | ");
    expect(queries).toContain("SMAC");
    expect(queries).toMatch(/association/i);
    expect(queries).toMatch(/bar/i);
    expect(queries).toMatch(/club/i);
    expect(queries).toMatch(/collectif/i);
    expect(queries).toMatch(/promoteur/i);
    expect(queries).toContain("Paris");
    expect(queries).toContain("France");
  });

  it("does not depend on event-only vocabulary like support slots or première partie", () => {
    const queries = buildVenueDiscoveryQueries("pop punk", "Paris", "France").join(" | ");
    expect(queries).not.toMatch(/support tba|première partie|premiere partie/i);
  });
});

describe("buildSimilarArtistVenueQueries", () => {
  it("builds venue-oriented (not concert-date-oriented) queries for a similar artist", () => {
    const queries = buildSimilarArtistVenueQueries("Thru It All", "Paris");
    expect(queries.some((q) => q.includes('"Thru It All"') && q.includes("venue"))).toBe(true);
    expect(queries.some((q) => q.includes("played"))).toBe(true);
  });
});

describe("classifyVenueDiscoveryCategory", () => {
  it("does not classify a result as a venue solely because its name contains a music-related keyword", () => {
    expect(classifyVenueDiscoveryCategory("Rock Café - best burgers and fries in town, family friendly diner")).toBeNull();
  });

  it("classifies a page with real live-music programming evidence as a venue", () => {
    expect(classifyVenueDiscoveryCategory("SMAC accueillant des concerts pop punk toute l'année, salle de 300 places, programmation live")).toBe("venue");
  });

  it("classifies an association organizing concerts as association, not venue", () => {
    expect(classifyVenueDiscoveryCategory("Larsen, association loi 1901 qui organise des concerts punk et programmation locale")).toBe("association");
  });

  it("classifies a collective as collective when evidenced", () => {
    expect(classifyVenueDiscoveryCategory("Le collectif organise des concerts et une programmation punk rock régulière")).toBe("collective");
  });

  it("classifies a promoter/booker page as promoter", () => {
    expect(classifyVenueDiscoveryCategory("Agence de booking et tourneur spécialisé en concerts punk rock, programmation nationale")).toBe("promoter");
  });

  it("classifies a bar hosting concerts as bar", () => {
    expect(classifyVenueDiscoveryCategory("Bar à concerts avec programmation live punk rock chaque semaine")).toBe("bar");
  });

  it("returns null when there is no live-music evidence at all", () => {
    expect(classifyVenueDiscoveryCategory("Paris pop punk clothing store, band t-shirts and merch")).toBeNull();
  });
});

describe("isEvergreenOrganizationCategory", () => {
  it("treats venues, bars, associations, collectives, festivals and promoters as evergreen", () => {
    expect(isEvergreenOrganizationCategory("venue")).toBe(true);
    expect(isEvergreenOrganizationCategory("bar")).toBe(true);
    expect(isEvergreenOrganizationCategory("association")).toBe(true);
    expect(isEvergreenOrganizationCategory("collective")).toBe(true);
    expect(isEvergreenOrganizationCategory("festival")).toBe(true);
    expect(isEvergreenOrganizationCategory("promoter")).toBe(true);
  });

  it("does not treat one-off events, springboards or open calls as evergreen", () => {
    expect(isEvergreenOrganizationCategory("event")).toBe(false);
    expect(isEvergreenOrganizationCategory("springboard")).toBe(false);
    expect(isEvergreenOrganizationCategory("open_call")).toBe(false);
  });
});

describe("buildVenueDiscoveryBookingSourceProvider", () => {
  it("returns a venue candidate with no event date required", async () => {
    const provider = buildVenueDiscoveryBookingSourceProvider({
      maxOrganizationQueries: 1,
      maxSimilarArtistVenueQueries: 0,
      maxResultsPerQuery: 1,
      webSearchProvider: {
        providerName: "test-venue-search",
        async search() {
          return [{
            title: "Le Klub",
            url: "https://example.test/le-klub",
            snippet: "SMAC parisienne accueillant une programmation pop punk et punk rock régulière, salle de 250 places, contact: booking@example.test",
            sourceProvider: "test-venue-search",
            confidence: 0.7,
            links: []
          }];
        }
      }
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toHaveLength(1);
    const target = result.targets[0]!;
    expect(target.category).toBe("venue");
    expect(target.eventDate).toBeNull();
    expect(target.estimatedCapacity).toBe(250);
    expect(target.sourceProvider).toBe("venue_discovery");
  });

  it("drops candidates without genuine live-music evidence instead of defaulting to venue", async () => {
    const provider = buildVenueDiscoveryBookingSourceProvider({
      maxOrganizationQueries: 1,
      maxSimilarArtistVenueQueries: 0,
      maxResultsPerQuery: 1,
      webSearchProvider: {
        providerName: "test-venue-search",
        async search() {
          return [{
            title: "Rock Café Diner",
            url: "https://example.test/rock-cafe-diner",
            snippet: "Best burgers and fries in a rock-themed diner, family friendly.",
            sourceProvider: "test-venue-search",
            confidence: 0.7,
            links: []
          }];
        }
      }
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toHaveLength(0);
    expect(result.metadata.droppedForMissingEvidence).toBeGreaterThan(0);
  });

  it("attaches similar-artist history when a similar artist is mentioned in the source text", async () => {
    const similarArtist = baseSimilarArtist({ name: "Thru It All" });
    const provider = buildVenueDiscoveryBookingSourceProvider({
      maxOrganizationQueries: 1,
      maxSimilarArtistVenueQueries: 0,
      maxResultsPerQuery: 1,
      webSearchProvider: {
        providerName: "test-venue-search",
        async search() {
          return [{
            title: "Supersonic",
            url: "https://example.test/supersonic",
            snippet: "Club parisien avec programmation punk rock régulière. A déjà accueilli Thru It All en concert.",
            sourceProvider: "test-venue-search",
            confidence: 0.7,
            links: []
          }];
        }
      }
    });

    const result = await provider.search({
      input: { ...input, similarArtists: [similarArtist] },
      maxResults: 5
    });

    const target = result.targets[0]!;
    expect(target.pastProgramming).toContain("Thru It All");
    expect(target.derivedFromSimilarArtist?.name).toBe("Thru It All");
  });

  it("survives full relevance filtering and appears as an actionable opportunity with no event date", async () => {
    const provider = buildVenueDiscoveryBookingSourceProvider({
      maxOrganizationQueries: 1,
      maxSimilarArtistVenueQueries: 0,
      maxResultsPerQuery: 1,
      webSearchProvider: {
        providerName: "test-venue-search",
        async search() {
          return [{
            title: "Le Ferrailleur",
            url: "https://example.test/le-ferrailleur",
            snippet: "Salle de concert nantaise avec une programmation pop punk et punk rock suivie, jauge de 400 places, contact booking@example.test",
            sourceProvider: "test-venue-search",
            confidence: 0.75,
            links: []
          }];
        }
      }
    });

    const result = await searchBookingOpportunities(input, {
      providers: [provider],
      now: new Date("2026-07-15T00:00:00Z")
    });

    expect(result.rejectedByReason.missingDate).toBe(0);
    const opportunity = result.opportunities.find((opp) => opp.sourceUrl === "https://example.test/le-ferrailleur");
    expect(opportunity).toBeDefined();
    expect(opportunity?.opportunityKind).toBe("actionable");
    expect(opportunity?.eventDate).toBeNull();
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
