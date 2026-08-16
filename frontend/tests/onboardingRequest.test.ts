import { afterEach, describe, expect, it, vi } from "vitest";
import { readOnboardingRequest } from "@/lib/onboardingRequest";
import type { OnboardingFormData } from "@/types";

const STORAGE_KEY = "artistRadarOnboardingData";

function stubLocalStorage(value: string | null) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => (key === STORAGE_KEY ? value : null),
    },
  });
}

function onboardingData(overrides: Partial<OnboardingFormData> = {}): OnboardingFormData {
  return {
    artistName: "Tuesday Fall",
    spotifyUrl: "",
    youtubeUrl: "",
    instagramUrl: "",
    websiteUrl: "",
    countryOfOrigin: "France",
    city: "Bordeaux",
    mainGenre: "pop punk",
    secondaryGenres: "",
    targetLocation: "",
    mainGoal: "booking_opportunities",
    useChartmetricEnrichment: false,
    chartmetricToggleVisible: false,
    ...overrides,
  };
}

describe("readOnboardingRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when nothing is stored", () => {
    stubLocalStorage(null);
    expect(readOnboardingRequest()).toBeNull();
  });

  it("omits the Chartmetric feature field for a standard production-shaped request (toggle never rendered)", () => {
    stubLocalStorage(
      JSON.stringify(
        onboardingData({
          useChartmetricEnrichment: false,
          chartmetricToggleVisible: false,
        })
      )
    );
    const request = readOnboardingRequest();
    expect(request?.features).toBeUndefined();
  });

  it("preserves the explicitly selected country separately from the city", () => {
    stubLocalStorage(JSON.stringify(onboardingData()));

    expect(readOnboardingRequest()).toMatchObject({
      location: "Bordeaux",
      referenceCountry: "France"
    });
  });

  it("omits the Chartmetric feature field when checked but the toggle was never server-verified as visible (defense in depth against stale/forged data)", () => {
    stubLocalStorage(
      JSON.stringify(
        onboardingData({
          useChartmetricEnrichment: true,
          chartmetricToggleVisible: false,
        })
      )
    );
    const request = readOnboardingRequest();
    expect(request?.features).toBeUndefined();
  });

  it("omits the Chartmetric feature field when the toggle was visible but left unchecked", () => {
    stubLocalStorage(
      JSON.stringify(
        onboardingData({
          useChartmetricEnrichment: false,
          chartmetricToggleVisible: true,
        })
      )
    );
    const request = readOnboardingRequest();
    expect(request?.features).toBeUndefined();
  });

  it("includes the Chartmetric feature field only when the toggle was both visible and checked", () => {
    stubLocalStorage(
      JSON.stringify(
        onboardingData({
          useChartmetricEnrichment: true,
          chartmetricToggleVisible: true,
        })
      )
    );
    const request = readOnboardingRequest();
    expect(request?.features).toEqual({ chartmetricArtistEnrichment: true });
  });
});
