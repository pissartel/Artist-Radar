import { describe, expect, it } from "vitest";
import { buildConfirmedOnboardingData } from "@/lib/confirmedOnboarding";

describe("confirmed onboarding persistence", () => {
  it("persists the complete Tuesday Fall booking context", () => {
    const data = buildConfirmedOnboardingData({
      artistName: "Tuesday Fall",
      spotifyUrl: "https://open.spotify.com/artist/tuesday-fall",
      genres: ["pop punk", "emo"],
      genre: "pop punk",
      city: "Paris",
      countryOfOrigin: "France",
      targetLocation: "France",
      createdAt: "2026-09-17T10:00:00.000Z",
    });

    expect(data).toMatchObject({
      artistName: "Tuesday Fall",
      mainGenre: "pop punk",
      city: "Paris",
      countryOfOrigin: "France",
      targetLocation: "France",
      mainGoal: "booking_opportunities",
    });
  });
});
