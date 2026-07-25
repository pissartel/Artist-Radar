import { describe, expect, it, vi } from "vitest";
import {
  buildOverpassBoundingBox,
  discoverLiveMusicVenuesFromOverpass
} from "../../src/sources/connectors/overpassLiveMusicConnector.js";
import { hasQualifyingActivityEvidence } from "../../src/sources/liveMusicEntities/activityEvidence.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

describe("buildOverpassBoundingBox", () => {
  it("builds a box centered on the given point that widens longitude near the equator vs higher latitudes", () => {
    const equatorBox = buildOverpassBoundingBox({ latitude: 0, longitude: 0 }, 10);
    const parisBox = buildOverpassBoundingBox({ latitude: 48.8566, longitude: 2.3522 }, 10);

    const equatorLonSpan = equatorBox.east - equatorBox.west;
    const parisLonSpan = parisBox.east - parisBox.west;
    expect(parisLonSpan).toBeGreaterThan(equatorLonSpan);
  });

  it("keeps the requested point within the box", () => {
    const center = { latitude: 44.8378, longitude: -0.5792 };
    const box = buildOverpassBoundingBox(center, 5);
    expect(box.south).toBeLessThan(center.latitude);
    expect(box.north).toBeGreaterThan(center.latitude);
    expect(box.west).toBeLessThan(center.longitude);
    expect(box.east).toBeGreaterThan(center.longitude);
  });
});

describe("discoverLiveMusicVenuesFromOverpass", () => {
  it("maps a tagged OSM node to a candidate with no activity evidence (candidate only, not proof of activity)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        elements: [
          {
            type: "node",
            id: 42,
            lat: 44.8422,
            lon: -0.6514,
            tags: {
              amenity: "music_venue",
              name: "Le Krakatoa",
              "addr:city": "Mérignac",
              website: "https://krakatoa.org"
            }
          }
        ]
      })
    );

    const result = await discoverLiveMusicVenuesFromOverpass(
      { south: 44, west: -1, north: 45, east: 0 },
      { fetchImpl }
    );

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.entityType).toBe("concert_venue");
    expect(candidate.name).toBe("Le Krakatoa");
    expect(candidate.activityEvidence).toEqual([]);
    expect(hasQualifyingActivityEvidence(candidate.activityEvidence)).toBe(false);

    const [, requestInit] = fetchImpl.mock.calls[0];
    expect(requestInit.headers["User-Agent"]).toBeTruthy();
  });

  it("drops elements with no live-music signal and elements missing a name", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        elements: [
          { type: "node", id: 1, tags: { amenity: "bakery", name: "Boulangerie" } },
          { type: "node", id: 2, tags: { amenity: "bar", live_music: "yes" } }
        ]
      })
    );

    const result = await discoverLiveMusicVenuesFromOverpass({ south: 0, west: 0, north: 1, east: 1 }, { fetchImpl });
    expect(result.candidates).toHaveLength(0);
  });

  it("returns a warning instead of throwing when the request fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await discoverLiveMusicVenuesFromOverpass({ south: 0, west: 0, north: 1, east: 1 }, { fetchImpl });
    expect(result.candidates).toEqual([]);
    expect(result.warnings[0]).toMatch(/network down/);
  });

  it("returns a warning when Overpass responds with a non-2xx status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 429));
    const result = await discoverLiveMusicVenuesFromOverpass({ south: 0, west: 0, north: 1, east: 1 }, { fetchImpl });
    expect(result.candidates).toEqual([]);
    expect(result.warnings[0]).toMatch(/429/);
  });
});
