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
    usePreviewData: false,
    previewDataToggleVisible: false,
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

  it("does not execute booking when all location data is missing", () => {
    stubLocalStorage(
      JSON.stringify(
        onboardingData({
          countryOfOrigin: "",
          city: "",
          mainGenre: "",
          targetLocation: "",
        })
      )
    );

    expect(readOnboardingRequest()).toBeNull();
  });

  it("uses an explicit target country when city is missing", () => {
    stubLocalStorage(
      JSON.stringify(
        onboardingData({
          countryOfOrigin: "",
          city: "",
          targetLocation: "France",
        })
      )
    );

    expect(readOnboardingRequest()).toMatchObject({
      location: "France",
      enableBooking: true,
    });
  });

  it("keeps city and reference country as separate concepts", () => {
    stubLocalStorage(JSON.stringify(onboardingData({ city: "Paris" })));

    expect(readOnboardingRequest()).toMatchObject({
      artistName: "Tuesday Fall",
      genre: "pop punk",
      location: "Paris",
      referenceCountry: "France",
      enableBooking: true,
    });
  });

  it("only uses Worldwide when the user explicitly entered it", () => {
    stubLocalStorage(
      JSON.stringify(onboardingData({ city: "", countryOfOrigin: "", targetLocation: "Worldwide" }))
    );

    expect(readOnboardingRequest()?.location).toBe("Worldwide");
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
    expect(request?.referenceCountry).toBe("France");
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
