import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/geocode/route";

describe("POST /api/geocode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects malformed query payloads", async () => {
    const response = await POST(new Request("http://localhost/api/geocode", {
      method: "POST", body: JSON.stringify({ queries: [""] }),
    }));
    expect(response.status).toBe(400);
  });

  it("normalizes provider coordinates and country code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      lat: "48.8566", lon: "2.3522", boundingbox: ["48.81", "48.90", "2.22", "2.47"],
      address: { country_code: "fr" },
    }]), { status: 200 })));
    const response = await POST(new Request("http://localhost/api/geocode", {
      method: "POST", body: JSON.stringify({ queries: ["Paris, France"] }),
    }));
    const body = await response.json();
    expect(body.results["paris, france"]).toEqual({
      latitude: 48.8566, longitude: 2.3522, countryCode: "FR",
      boundingBox: [48.81, 48.9, 2.22, 2.47],
    });
  });
});
