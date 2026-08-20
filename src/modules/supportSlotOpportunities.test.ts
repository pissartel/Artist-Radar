import { describe, expect, it } from "vitest";
import type { ArtistConcert } from "../providers/concerts/ArtistConcertProvider.js";
import type { SimilarArtist } from "../schemas.js";
import type { SimilarArtistConcertsResult } from "./similarArtistConcerts.js";
import {
  findSupportSlotOpportunities,
  resolveSupportReferenceCountry
} from "./supportSlotOpportunities.js";

const NOW = new Date("2026-08-20T12:00:00.000Z");

describe("support-slot opportunity discovery", () => {
  it("prefers the user-selected reference country over the artist profile", () => {
    expect(resolveSupportReferenceCountry("Belgium", "France")).toEqual({
      referenceCountry: "Belgium",
      referenceCountrySource: "user_input"
    });
    expect(resolveSupportReferenceCountry(null, "France")).toEqual({
      referenceCountry: "France",
      referenceCountrySource: "artist_profile"
    });
  });

  it("keeps a foreign compatible headliner whose concert is in the reference country", () => {
    const result = discover(history("Neck Deep", "United Kingdom", event()));

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]).toMatchObject({
      headliner: "Neck Deep",
      country: "France",
      lineupStatus: "no_support_announced",
      wording: "Potential support opportunity"
    });
  });

  it("keeps a same-country larger headliner", () => {
    const result = discover(history("Chunk! No, Captain Chunk!", "France", event()), {
      "Chunk! No, Captain Chunk!": 55
    });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]?.scaleFit).toBe("realistic_step_up");
  });

  it("excludes an event when a support act is already confirmed", () => {
    const result = discover(history("Neck Deep", "United Kingdom", event({
      lineup: [{ name: "Neck Deep" }, { name: "The Wonder Years" }]
    })));

    expect(result.opportunities).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe("support_already_announced");
  });

  it("ranks an unknown lineup below a reliably empty lineup and labels it unverified", () => {
    const reliable = event({ date: "2026-10-20", lineup: [] });
    const uncertain = event({ date: "2026-10-21", lineup: undefined, sources: [source("bandsintown")] });
    const result = discover(history("Neck Deep", "United Kingdom", reliable, uncertain));

    expect(result.opportunities.map((opportunity) => opportunity.lineupStatus)).toEqual([
      "no_support_announced",
      "lineup_uncertain"
    ]);
    expect(result.opportunities[1]?.wording).toBe("Lineup incomplete — support availability unverified");
    expect(result.opportunities[0]!.supportOpportunityScore).toBeGreaterThan(result.opportunities[1]!.supportOpportunityScore);
  });

  it("excludes festivals and cancelled or past events", () => {
    const festival = event({ date: "2026-10-20", festivalName: "Hellfest" });
    const cancelled = event({ date: "2026-10-21", status: "cancelled" });
    const staleUpcoming = event({ date: "2026-01-01", status: "upcoming" });
    const result = discover(history("Neck Deep", "United Kingdom", festival, cancelled, staleUpcoming));

    expect(result.opportunities).toHaveLength(0);
    expect(result.rejected.map((entry) => entry.reason)).toEqual([
      "festival",
      "cancelled_or_not_upcoming",
      "cancelled_or_not_upcoming"
    ]);
  });

  it("excludes concerts outside the reference country regardless of headliner origin", () => {
    const result = discover(history("Neck Deep", "United Kingdom", event({
      venue: { name: "Ancienne Belgique", city: "Brussels", country: "Belgium" }
    })));

    expect(result.rejected[0]?.reason).toBe("outside_reference_country");
  });

  it("excludes generic genre matches", () => {
    const result = discover(history("Generic Rock Act", "France", event(), { genres: ["rock"], reason: "Broad rock catalog." }));

    expect(result.rejected[0]?.reason).toBe("weak_genre_match");
  });

  it("excludes extreme scale mismatches while retaining configurable realistic step-ups", () => {
    const extreme = discover(history("Arena Giant", "United States", event()), { "Arena Giant": 95 });
    const realistic = discover(history("Scene Headliner", "France", event()), { "Scene Headliner": 60 });

    expect(extreme.rejected[0]?.reason).toBe("extreme_scale_mismatch");
    expect(realistic.opportunities[0]?.scaleDifference).toBe(20);
  });

  it("retains explicit additional-support openings but never claims definite availability", () => {
    const result = discover(history("Neck Deep", "United Kingdom", event({
      name: "Neck Deep + The Wonder Years + additional support TBA",
      lineup: [{ name: "Neck Deep" }, { name: "The Wonder Years" }]
    })));

    expect(result.opportunities[0]).toMatchObject({
      lineupStatus: "additional_support_explicitly_open",
      wording: "Potential support opportunity"
    });
  });
});

function discover(concertHistory: SimilarArtistConcertsResult, artistScaleByName: Record<string, number> = { "Neck Deep": 60 }) {
  return findSupportSlotOpportunities({
    targetArtist: { name: "Small Town Riot", genres: ["pop punk"], country: "France", artistScaleScore: 40 },
    concertHistory: [concertHistory],
    artistScaleByName,
    now: NOW
  });
}

function history(name: string, country: string, ...args: Array<ArtistConcert | { genres: string[]; reason?: string }>): SimilarArtistConcertsResult {
  const override = args.at(-1) && !("date" in args.at(-1)!) ? args.pop() as { genres: string[]; reason?: string } : undefined;
  return {
    artist: {
      name,
      country,
      genres: override?.genres ?? ["pop punk"],
      reason: override?.reason ?? "Shares the pop-punk and emo scene.",
      commercialTier: "slightly_larger",
      totalRelevance: 90
    } as SimilarArtist,
    pastConcerts: [],
    upcomingConcerts: args as ArtistConcert[]
  };
}

function event(overrides: Partial<ArtistConcert> = {}): ArtistConcert {
  return {
    artist: { name: "Neck Deep" },
    name: "Neck Deep live",
    date: "2026-10-20",
    status: "upcoming",
    venue: { name: "Le Trabendo", city: "Paris", country: "France" },
    lineup: [],
    sources: [source("bandsintown"), source("songkick")],
    confidence: 0.9,
    ...overrides
  };
}

function source(provider: "bandsintown" | "songkick") {
  return { provider, url: `https://example.com/${provider}/event` } as const;
}
