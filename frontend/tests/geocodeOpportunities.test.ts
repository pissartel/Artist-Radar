import { describe, expect, it, vi } from "vitest";
import { geocodeOpportunity } from "@/lib/server/geocodeOpportunities";
import type { Opportunity } from "@/types";

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "venue-paris",
    type: "venue",
    category: "venue",
    title: "Venue",
    location: "Paris, France",
    city: "Paris",
    country: "France",
    description: "A venue",
    tags: [],
    matchScore: 80,
    matchReasons: ["Relevant"],
    genres: [],
    recentEvents: [],
    lineup: [],
    ...overrides,
  };
}

describe("opportunity geocoding", () => {
  it("uses city-level coordinates and marks them approximate when no address is known", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ lat: "48.8566", lon: "2.3522" }]), { status: 200 }));
    const result = await geocodeOpportunity(opportunity(), fetcher as typeof fetch);

    expect(result).toMatchObject({ latitude: 48.8566, longitude: 2.3522, locationPrecision: "approximate" });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("q=Paris%2C+France");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ next: { revalidate: 2_592_000 } });
  });

  it("uses the structured address and marks the result exact", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ lat: "48.865", lon: "2.38" }]), { status: 200 }));
    const result = await geocodeOpportunity(opportunity({ address: "1 rue Example" }), fetcher as typeof fetch);

    expect(result.locationPrecision).toBe("exact");
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("1+rue+Example%2C+Paris%2C+France");
  });

  it("does not request geocoding when stored coordinates already exist", async () => {
    const fetcher = vi.fn();
    const result = await geocodeOpportunity(opportunity({ latitude: 1, longitude: 2 }), fetcher as typeof fetch);

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.locationPrecision).toBe("approximate");
  });

  it("returns the opportunity unchanged when geocoding fails", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    const original = opportunity();
    await expect(geocodeOpportunity(original, fetcher as typeof fetch)).resolves.toEqual(original);
  });
});
