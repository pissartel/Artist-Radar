import { describe, expect, it } from "vitest";
import { resolveAttraction, type TicketmasterAttractionCandidate } from "../../../src/providers/ticketmaster/attractionResolution.js";

function candidate(overrides: Partial<TicketmasterAttractionCandidate> = {}): TicketmasterAttractionCandidate {
  return {
    id: "K8vZ1",
    name: "Paris Peer One",
    classificationSegment: "Music",
    genres: ["Punk", "Alternative Rock"],
    ...overrides
  };
}

describe("resolveAttraction", () => {
  it("resolves an exact normalized name match", () => {
    const result = resolveAttraction("Paris Peer One", [candidate()], { targetGenres: ["pop punk"] });
    expect(result).toMatchObject({ status: "resolved", attractionId: "K8vZ1", attractionName: "Paris Peer One" });
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("resolves via a known alias when the exact name doesn't match", () => {
    const result = resolveAttraction("Peer One", [
      candidate({ id: "K8vZ2", name: "Paris Peer One (official)", aliases: ["Peer One"] })
    ]);
    expect(result).toMatchObject({ status: "resolved", attractionId: "K8vZ2" });
  });

  it("reports ambiguous when two candidates score too closely to pick one automatically", () => {
    const result = resolveAttraction("Peer One", [
      candidate({ id: "a", name: "Peer One Band", classificationSegment: "Music" }),
      candidate({ id: "b", name: "Peer One Collective", classificationSegment: "Music" })
    ]);
    expect(result.status).toBe("ambiguous");
    expect(result.attractionId).toBeUndefined();
  });

  it("rejects a non-music attraction (e.g. a sports team or theater show) even with a name match", () => {
    const result = resolveAttraction("Paris Peer One", [
      candidate({ classificationSegment: "Sports" })
    ]);
    expect(result.status).toBe("not_found");
  });

  it("rejects an obvious tribute act rather than matching the real artist", () => {
    const result = resolveAttraction("Paris Peer One", [
      candidate({ id: "tribute-1", name: "Paris Peer One Tribute Band" })
    ]);
    expect(result.status).toBe("not_found");
  });

  it("does not reject an artist whose own real name legitimately contains 'tribute'", () => {
    const result = resolveAttraction("A Tribute to Nothing", [
      candidate({ id: "real-1", name: "A Tribute to Nothing", classificationSegment: "Music" })
    ]);
    expect(result.status).toBe("resolved");
  });

  it("gives only a weak score to a partial substring match, not enough to resolve alone against a strong rival", () => {
    const result = resolveAttraction("Peer", [
      candidate({ id: "weak", name: "Peer Group Musicians", classificationSegment: "Music" }),
      candidate({ id: "strong", name: "Peer", classificationSegment: "Music" })
    ]);
    expect(result.status).toBe("resolved");
    expect(result.attractionId).toBe("strong");
  });

  it("returns not_found when there are no candidates at all", () => {
    const result = resolveAttraction("Unknown Artist", []);
    expect(result).toMatchObject({ status: "not_found", confidence: 0 });
  });

  it("returns not_found when no candidate has any relation to the requested name", () => {
    const result = resolveAttraction("Paris Peer One", [candidate({ name: "Completely Different Act" })]);
    expect(result.status).toBe("not_found");
  });

  it("penalizes an incompatible genre but does not necessarily reject on genre alone", () => {
    const compatible = resolveAttraction("Paris Peer One", [candidate({ genres: ["Punk"] })], { targetGenres: ["pop punk"] });
    const incompatible = resolveAttraction("Paris Peer One", [candidate({ genres: ["Classical"] })], { targetGenres: ["pop punk"] });
    expect(compatible.confidence).toBeGreaterThan(incompatible.confidence);
  });

  it("never automatically picks the first result when the top candidates are equally strong", () => {
    const result = resolveAttraction("Peer", [
      candidate({ id: "first", name: "Peer" }),
      candidate({ id: "second", name: "Peer" })
    ]);
    // Both are exact matches with identical scores -> ambiguous, not "first wins by default".
    expect(result.status).toBe("ambiguous");
  });
});
