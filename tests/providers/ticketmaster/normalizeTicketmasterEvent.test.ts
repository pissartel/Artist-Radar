import { describe, expect, it } from "vitest";
import {
  assessLineup,
  normalizeTicketmasterEvent,
  type TicketmasterEventApi
} from "../../../src/providers/ticketmaster/normalizeTicketmasterEvent.js";

const now = new Date("2026-07-01T00:00:00Z");

function rawEvent(overrides: Partial<TicketmasterEventApi> = {}): TicketmasterEventApi {
  return {
    id: "evt-1",
    name: "Paris Peer One at La Maroquinerie",
    url: "https://www.ticketmaster.com/event/evt-1",
    dates: { start: { localDate: "2026-09-04", localTime: "19:00:00", dateTime: "2026-09-04T17:00:00Z" }, timezone: "Europe/Paris", status: { code: "onsale" } },
    classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" }, subGenre: { name: "Punk" } }],
    _embedded: {
      venues: [{ id: "venue-1", name: "La Maroquinerie", city: { name: "Paris" }, country: { name: "France" }, location: { latitude: "48.86", longitude: "2.38" } }],
      attractions: [{ id: "K8vZ1", name: "Paris Peer One" }]
    },
    ...overrides
  };
}

describe("normalizeTicketmasterEvent", () => {
  it("normalizes a well-formed event", () => {
    const concert = normalizeTicketmasterEvent(rawEvent(), now);
    expect(concert).toMatchObject({
      provider: "ticketmaster",
      eventId: "evt-1",
      name: "Paris Peer One at La Maroquinerie",
      status: "upcoming",
      venue: { name: "La Maroquinerie", city: "Paris", country: "France", latitude: 48.86, longitude: 2.38 },
      attractions: [{ ticketmasterId: "K8vZ1", name: "Paris Peer One", isMainAttraction: true }],
      eventType: "concert"
    });
  });

  it("returns null when the event lacks an id, name or date", () => {
    expect(normalizeTicketmasterEvent(rawEvent({ id: undefined }), now)).toBeNull();
    expect(normalizeTicketmasterEvent(rawEvent({ name: undefined }), now)).toBeNull();
    expect(normalizeTicketmasterEvent(rawEvent({ dates: undefined }), now)).toBeNull();
  });

  it("handles a missing venue/attractions/classifications without throwing", () => {
    const concert = normalizeTicketmasterEvent(rawEvent({ _embedded: undefined, classifications: undefined }), now);
    expect(concert).toMatchObject({ venue: undefined, attractions: [], classifications: undefined });
  });

  it("classifies status as past when the date is before now", () => {
    const concert = normalizeTicketmasterEvent(rawEvent({ dates: { start: { localDate: "2026-01-01" }, status: { code: "onsale" } } }), now);
    expect(concert?.status).toBe("past");
  });

  it("respects an explicit cancelled/postponed/rescheduled status regardless of date", () => {
    expect(normalizeTicketmasterEvent(rawEvent({ dates: { start: { localDate: "2026-09-04" }, status: { code: "cancelled" } } }), now)?.status).toBe("cancelled");
    expect(normalizeTicketmasterEvent(rawEvent({ dates: { start: { localDate: "2026-09-04" }, status: { code: "postponed" } } }), now)?.status).toBe("postponed");
    expect(normalizeTicketmasterEvent(rawEvent({ dates: { start: { localDate: "2026-09-04" }, status: { code: "rescheduled" } } }), now)?.status).toBe("rescheduled");
  });

  it("detects a festival from the event name", () => {
    const concert = normalizeTicketmasterEvent(rawEvent({ name: "Summer Fest 2026" }), now);
    expect(concert?.eventType).toBe("festival");
  });

  it("detects a festival from a large number of attractions even without 'festival' in the name", () => {
    const concert = normalizeTicketmasterEvent(rawEvent({
      _embedded: {
        venues: rawEvent()._embedded!.venues,
        attractions: [{ id: "1", name: "A" }, { id: "2", name: "B" }, { id: "3", name: "C" }, { id: "4", name: "D" }]
      }
    }), now);
    expect(concert?.eventType).toBe("festival");
  });

  it("preserves sales and image data when present", () => {
    const concert = normalizeTicketmasterEvent(rawEvent({
      sales: { public: { startDateTime: "2026-01-01T00:00:00Z", endDateTime: "2026-09-04T00:00:00Z" } },
      images: [{ url: "https://example.com/image.jpg", ratio: "16_9", width: 1024, height: 576 }]
    }), now);
    expect(concert?.sales).toMatchObject({ publicStartDateTime: "2026-01-01T00:00:00Z" });
    expect(concert?.images).toEqual([{ url: "https://example.com/image.jpg", ratio: "16_9", width: 1024, height: 576 }]);
  });
});

describe("assessLineup", () => {
  it("returns unlikely with an explanation when multiple attractions are already listed", () => {
    const concert = normalizeTicketmasterEvent(rawEvent({
      _embedded: {
        venues: rawEvent()._embedded!.venues,
        attractions: [{ id: "1", name: "Paris Peer One" }, { id: "2", name: "Support Act" }]
      }
    }), now)!;
    const assessment = assessLineup(concert, now);
    expect(assessment).toMatchObject({ listedArtistCount: 2, lineupCompleteness: "possibly_complete", supportSlotSignal: "unlikely" });
    expect(assessment.explanation).toContain("already listed");
  });

  it("never infers an available support slot from multiple attractions", () => {
    const concert = normalizeTicketmasterEvent(rawEvent({
      _embedded: {
        venues: rawEvent()._embedded!.venues,
        attractions: [{ id: "1", name: "Paris Peer One" }, { id: "2", name: "Support Act" }]
      }
    }), now)!;
    expect(assessLineup(concert, now).supportSlotSignal).not.toBe("possible");
  });

  it("gives a hedged 'possible' signal for a single attraction far enough in the future, with an explicit explanation", () => {
    const concert = normalizeTicketmasterEvent(rawEvent({ dates: { start: { localDate: "2026-12-01" }, status: { code: "onsale" } } }), now)!;
    const assessment = assessLineup(concert, now);
    expect(assessment).toMatchObject({ listedArtistCount: 1, lineupCompleteness: "unknown", supportSlotSignal: "possible" });
    expect(assessment.explanation).toMatch(/not confirmation of an available support slot/);
  });

  it("gives 'unlikely' for a single attraction when the event is very soon", () => {
    const concert = normalizeTicketmasterEvent(rawEvent({ dates: { start: { localDate: "2026-07-05" }, status: { code: "onsale" } } }), now)!;
    expect(assessLineup(concert, now).supportSlotSignal).toBe("unlikely");
  });

  it("gives 'unknown' for a single attraction on a past event", () => {
    const concert = normalizeTicketmasterEvent(rawEvent({ dates: { start: { localDate: "2026-01-01" }, status: { code: "onsale" } } }), now)!;
    expect(assessLineup(concert, now).supportSlotSignal).toBe("unknown");
  });

  it("does not evaluate festivals as standalone venue support-slot opportunities", () => {
    const concert = normalizeTicketmasterEvent(rawEvent({ name: "Big Fest 2026" }), now)!;
    const assessment = assessLineup(concert, now);
    expect(assessment.supportSlotSignal).toBe("unknown");
    expect(assessment.explanation).toContain("Festival");
  });
});
