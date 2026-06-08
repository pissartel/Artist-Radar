import type { BookingSourceProvider } from "./BookingSourceProvider.js";

export function buildMockBookingSourceProvider(): BookingSourceProvider {
  return {
    providerName: "mock_booking_source",
    async search({ input }) {
      return {
        sourceProvider: "mock_booking_source",
        searchedQueries: [`${input.genre} ${input.city} booking opportunities`],
        warnings: [],
        metadata: { enabled: true, mock: true },
        targets: [
          {
            name: "Mock Pop Punk Club",
            category: "venue",
            city: input.city,
            country: "France",
            description: "Mock venue programming pop punk and punk rock shows. Booking: booking@example.test",
            sourceUrl: "https://example.test/mock-pop-punk-club",
            sourceType: "mock",
            genres: [input.genre],
            estimatedCapacity: 180,
            contacts: [
              {
                type: "email",
                value: "booking@example.test",
                sourceUrl: "https://example.test/mock-pop-punk-club",
                confidence: 0.9,
                notes: "Mock booking email for tests only."
              }
            ],
            confidence: 0.9,
            evidence: ["Mock venue for Booking Search tests."]
          }
        ]
      };
    }
  };
}
