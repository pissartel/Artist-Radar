import { describe, expect, it } from "vitest";
import {
  computeVenueProgrammingProfile,
  isProfileStale,
  mergeEventObservations,
  scoreVenueProfileFit,
  type CanonicalEventRecord,
  type VenueEventObservation
} from "../src/services/venueProgrammingProfileService.js";

const now = new Date("2026-09-21T00:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);

function event(overrides: Partial<CanonicalEventRecord> & { genres?: string[]; scale?: number | null; artistId?: string }): CanonicalEventRecord {
  return {
    venueId: "v1", date: daysAgo(10), status: "past", confidence: 0.9, promoterId: null,
    artists: [{ artistId: overrides.artistId ?? "a1", billingRole: "headliner", genres: overrides.genres ?? ["pop punk"], scale: overrides.scale === undefined ? 20 : overrides.scale }],
    ...overrides
  };
}

const obs = (provider: string, overrides: Partial<VenueEventObservation> = {}): VenueEventObservation => ({
  provider, externalId: `${provider}-1`, date: "2026-03-01", venue: { name: "Le Krakatoa", city: "Mérignac" },
  artists: [{ name: "Tuesday Fall", genres: ["pop punk"] }], confidence: 0.7, ...overrides
});

describe("mergeEventObservations", () => {
  it("collapses the same venue/date across providers and keeps every source", () => {
    const { events, duplicatesMerged } = mergeEventObservations([
      obs("ticketmaster"),
      obs("songkick", { venue: { name: "Krakatoa", city: "Mérignac" }, artists: [{ name: "Tuesday Fall" }, { name: "Mina Warren" }] })
    ], now);
    expect(events).toHaveLength(1);
    expect(duplicatesMerged).toBe(1);
    expect(events[0]!.sources.map((s) => s.provider).sort()).toEqual(["songkick", "ticketmaster"]);
    expect(events[0]!.artists.map((a) => a.name).sort()).toEqual(["Mina Warren", "Tuesday Fall"]);
    expect(events[0]!.confidence).toBeGreaterThan(0.7);
    expect(events[0]!.status).toBe("past");
  });

  it("lets a cancellation from any source win and does not merge different dates", () => {
    const { events } = mergeEventObservations([
      obs("ticketmaster", { status: "upcoming", date: "2026-12-01" }),
      obs("songkick", { status: "cancelled", date: "2026-12-01" }),
      obs("songkick", { date: "2026-12-02", externalId: "other" })
    ], now);
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.date === "2026-12-01")!.status).toBe("cancelled");
  });
});

describe("computeVenueProgrammingProfile", () => {
  it("returns an empty zero-confidence profile for no history", () => {
    const profile = computeVenueProgrammingProfile("v1", [], now);
    expect(profile.evidenceCount).toBe(0);
    expect(profile.confidence).toBe(0);
    expect(profile.medianArtistScale).toBeNull();
    expect(profile.dataOrigin).toBe("inferred");
  });

  it("does not overreact to a single one-off event (sparse history)", () => {
    const profile = computeVenueProgrammingProfile("v1", [event({})], now);
    expect(profile.genreAffinityScores.pop_punk).toBeLessThanOrEqual(0.5);
    expect(profile.confidence).toBeLessThan(0.6);
    expect(profile.emergingArtistShare).toBeNull();
  });

  it("infers genre affinity from repeated programming and weights recent events more", () => {
    const recent = Array.from({ length: 6 }, (_, i) => event({ date: daysAgo(20 + i * 10), artistId: `p${i}`, genres: ["pop punk", "emo"] }));
    const old = [event({ date: daysAgo(1500), artistId: "m1", genres: ["metalcore"] })];
    const profile = computeVenueProgrammingProfile("v1", [...recent, ...old], now);
    const scores = profile.genreAffinityScores;
    expect(scores.pop_punk).toBeGreaterThan(0.7);
    expect(scores.emo).toBeGreaterThan(0.7);
    expect(scores.metalcore).toBeLessThan(0.1);
    expect(profile.normalizedGenres[0]).toBe("pop_punk");
    expect(profile.eventsLast90Days).toBe(6);
  });

  it("retains old events as weak evidence rather than dropping them", () => {
    const profile = computeVenueProgrammingProfile("v1", [event({ date: daysAgo(2000), genres: ["punk rock"] })], now);
    expect(profile.genreAffinityScores.punk_rock).toBeGreaterThan(0);
    expect(profile.eventsLast365Days).toBe(0);
    expect(profile.latestKnownEventAt).toBe(daysAgo(2000));
  });

  it("keeps cancelled events out of positive evidence", () => {
    const cancelled = event({ status: "cancelled", genres: ["metalcore"], artistId: "c1" });
    const profile = computeVenueProgrammingProfile("v1", [event({ date: daysAgo(30) }), cancelled], now);
    expect(profile.genreAffinityScores.metalcore).toBeUndefined();
    expect(profile.relevantArtistIds).not.toContain("c1");
    expect(profile.evidenceCount).toBe(1);
  });

  it("aggregates artist scale and lowers confidence when scale data is missing", () => {
    const scaled = [10, 20, 30, 60, 80].map((scale, i) => event({ date: daysAgo(10 + i), artistId: `s${i}`, scale }));
    const full = computeVenueProgrammingProfile("v1", scaled, now);
    expect(full.minArtistScale).toBe(10);
    expect(full.medianArtistScale).toBe(30);
    expect(full.maxArtistScale).toBe(80);
    expect(full.emergingArtistShare).toBe(0.6);

    const sparse = computeVenueProgrammingProfile("v1", scaled.map((e) => ({ ...e, artists: e.artists.map((a) => ({ ...a, scale: null })) })), now);
    expect(sparse.medianArtistScale).toBeNull();
    expect(sparse.evidenceCount).toBe(5);
    expect(sparse.confidence).toBeLessThan(full.confidence);
  });

  it("represents a mixed-programming venue with several genres and repeated promoters", () => {
    const events = [
      ...Array.from({ length: 4 }, (_, i) => event({ date: daysAgo(15 * (i + 1)), artistId: `pp${i}`, genres: ["pop punk"], promoterId: "promo-1" })),
      ...Array.from({ length: 4 }, (_, i) => event({ date: daysAgo(15 * (i + 1)), artistId: `mc${i}`, genres: ["metalcore"], promoterId: i === 0 ? "promo-2" : "promo-1" }))
    ];
    const profile = computeVenueProgrammingProfile("v1", events, now);
    expect(profile.genreAffinityScores.pop_punk).toBeCloseTo(profile.genreAffinityScores.metalcore!, 1);
    expect(profile.genreAffinityScores.pop_punk).toBeLessThan(0.6);
    expect(profile.promoterIds).toEqual(["promo-1"]);
  });

  it("flags stale profiles and outdated score versions", () => {
    const profile = computeVenueProgrammingProfile("v1", [event({})], now);
    expect(isProfileStale(profile, now)).toBe(false);
    expect(isProfileStale(profile, new Date(now.getTime() + 60 * 86_400_000))).toBe(true);
    expect(isProfileStale({ ...profile, scoreVersion: "old" }, now)).toBe(true);
  });
});

describe("scoreVenueProfileFit", () => {
  const profile = computeVenueProgrammingProfile("v1",
    Array.from({ length: 6 }, (_, i) => event({ date: daysAgo(10 + i), artistId: `x${i}`, scale: 20 + i })), now);

  it("prefers genre and comparable-artist evidence over size", () => {
    const match = scoreVenueProfileFit(profile, { genres: ["Pop Punk"], scale: 22, similarArtistIds: ["x0", "x1"] }, now);
    const mismatch = scoreVenueProfileFit(profile, { genres: ["jazz"], scale: 22 }, now);
    expect(match.score).toBeGreaterThan(mismatch.score);
    expect(match.reasons.length).toBeGreaterThan(0);
    expect(mismatch.genreScore).toBe(0);
  });

  it("penalises an artist far outside the venue's scale range", () => {
    const inRange = scoreVenueProfileFit(profile, { genres: ["pop punk"], scale: 22 }, now);
    const tooBig = scoreVenueProfileFit(profile, { genres: ["pop punk"], scale: 95 }, now);
    expect(tooBig.score).toBeLessThan(inRange.score);
  });
});
