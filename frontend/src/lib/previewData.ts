import type { Opportunity, OpportunityType, SimilarArtist } from "@/types";
import type { ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";

type PreviewPlace = { city: string; latitude: number; longitude: number };

const COUNTRY_PLACES: Record<string, PreviewPlace[]> = {
  france: [
    { city: "Paris", latitude: 48.8566, longitude: 2.3522 },
    { city: "Lyon", latitude: 45.764, longitude: 4.8357 },
    { city: "Bordeaux", latitude: 44.8378, longitude: -0.5792 },
    { city: "Nantes", latitude: 47.2184, longitude: -1.5536 },
    { city: "Lille", latitude: 50.6292, longitude: 3.0573 },
    { city: "Toulouse", latitude: 43.6047, longitude: 1.4442 },
  ],
  germany: [
    { city: "Berlin", latitude: 52.52, longitude: 13.405 },
    { city: "Hamburg", latitude: 53.5511, longitude: 9.9937 },
    { city: "Cologne", latitude: 50.9375, longitude: 6.9603 },
    { city: "Leipzig", latitude: 51.3397, longitude: 12.3731 },
    { city: "Munich", latitude: 48.1351, longitude: 11.582 },
    { city: "Frankfurt", latitude: 50.1109, longitude: 8.6821 },
  ],
  "united kingdom": [
    { city: "London", latitude: 51.5072, longitude: -0.1276 },
    { city: "Manchester", latitude: 53.4808, longitude: -2.2426 },
    { city: "Bristol", latitude: 51.4545, longitude: -2.5879 },
    { city: "Leeds", latitude: 53.8008, longitude: -1.5491 },
    { city: "Glasgow", latitude: 55.8642, longitude: -4.2518 },
    { city: "Brighton", latitude: 50.8225, longitude: -0.1372 },
  ],
};

const DEFAULT_PLACES = COUNTRY_PLACES.france;
const TYPE_TITLES: Record<OpportunityType, string> = {
  venue: "The Foundry Live Room",
  concert: "Northern Lights Indie Night",
  festival: "Riverside Sounds Festival",
  opening_slot: "Support slot for The Midnight Lines",
  organization: "Atlas Live Booking & Promotion",
  label: "Harbour Street Records",
};

function normalized(place: PreviewPlace, country: string) {
  return { city: place.city, country, latitude: place.latitude, longitude: place.longitude, precision: "exact" as const };
}

function previewSimilarArtists(genre: string, country: string, places: PreviewPlace[]): SimilarArtist[] {
  const names = ["Velvet Transit", "Paper Satellites", "June Arcade", "Neon Harbour", "Quiet Parade", "Silver Avenue"];
  return names.map((name, index) => ({
    id: `preview-artist-${index + 1}`,
    name,
    genres: [genre, index % 2 ? "dream pop" : "indie rock"],
    location: `${places[index].city}, ${country}`,
    matchScore: 92 - index * 4,
    musicalMatchScore: 94 - index * 3,
    reason: `Strong ${genre} overlap and an active live audience in ${places[index].city}.`,
    artistTier: index < 2 ? "rising" : "emerging",
    monthlyListeners: 18000 + index * 7300,
    normalizedLocation: normalized(places[index], country),
  }));
}

function previewOpportunities(genre: string, country: string, places: PreviewPlace[]): Opportunity[] {
  const types: OpportunityType[] = ["venue", "concert", "festival", "opening_slot", "organization", "label"];
  return types.map((type, index) => {
    const place = places[index];
    const isEvent = type === "concert" || type === "festival" || type === "opening_slot";
    const sourceUrl = `https://example.com/artist-radar-preview/${type}`;
    return {
      id: `preview-${type}-1`,
      type,
      category: type,
      title: TYPE_TITLES[type],
      organizationType: type === "organization" ? "booking_agency" : undefined,
      location: `${place.city}, ${country}`,
      city: place.city,
      country,
      venue: type === "venue" ? TYPE_TITLES.venue : isEvent ? `${place.city} Arts Hall` : undefined,
      normalizedLocation: normalized(place, country),
      latitude: place.latitude,
      longitude: place.longitude,
      date: isEvent ? `2026-${String(10 + index).padStart(2, "0")}-18` : undefined,
      deadline: type === "festival" || type === "opening_slot" ? "2026-09-15" : undefined,
      description: `A credible ${genre} opportunity with a locally engaged audience and a clear public contact route.`,
      tags: [genre, place.city, type.replace("_", " ")],
      matchScore: 91 - index * 3,
      matchReasons: [`Programming aligns with ${genre}.`, `Useful reach in ${place.city}.`],
      recommendedAction: type === "label" ? "Review the demo policy before submitting." : "Use the official source to confirm availability.",
      genres: [genre, "alternative"],
      venueCapacity: type === "venue" || isEvent ? 350 + index * 180 : null,
      venueWebsite: type === "venue" ? sourceUrl : undefined,
      sourceUrls: [sourceUrl],
      sourceProvider: "Preview fixture",
      sourceEvidence: [{ url: sourceUrl, title: "Official opportunity page", retrievedInfo: "Location, category and public details" }],
      contacts: [{
        purpose: "booking",
        label: "Official booking page",
        value: sourceUrl,
        url: sourceUrl,
        verified: true,
        source: "Official website",
      }],
      recentEvents: type === "venue" || type === "festival" ? ["Independent Artists Showcase", "Regional New Music Night"] : [],
      lineup: isEvent ? ["The Midnight Lines", "Paper Satellites"] : [],
      roster: type === "organization" || type === "label" ? ["Velvet Transit", "June Arcade"] : undefined,
      labelDetails: type === "label" ? {
        genres: [genre, "alternative"], geographicScope: "national", territory: country,
        isActive: true, audienceLevel: "medium", supportingSimilarArtists: ["Velvet Transit"],
        demoPolicy: "open", demoSubmissionUrl: sourceUrl, publicContactEmail: null,
        contactUrl: sourceUrl, distributor: null, websiteUrl: sourceUrl, bandcampUrl: null,
        primaryUrl: sourceUrl, evidence: [{ provider: "official_website", sourceUrl, confidence: 95 }],
        sources: [{ name: "Official website", url: sourceUrl }],
      } : undefined,
    };
  });
}

export function createPreviewArtistRadarResponse(request: ArtistRadarRequest): ArtistRadarResponse {
  const country = request.referenceCountry || "France";
  const places = COUNTRY_PLACES[country.toLocaleLowerCase()] ?? DEFAULT_PLACES;
  const similarArtists = previewSimilarArtists(request.genre, country, places);
  const bookingOpportunities = previewOpportunities(request.genre, country, places);
  return {
    artist: {
      id: "preview-current-artist", name: request.artistName, genres: [request.genre],
      location: `${request.location}, ${country}`, city: request.location, country,
      monthlyListeners: 24700, growthPercent: 8.4,
      normalizedLocation: { country, precision: "country" },
    },
    kpis: [
      { id: "similar-artists", label: "Similar artists", value: similarArtists.length },
      { id: "opportunities", label: "Opportunities", value: bookingOpportunities.length },
      { id: "cities", label: "Cities", value: places.length },
    ],
    similarArtists,
    bookingOpportunities,
    topCities: places.slice(0, 5).map((place) => ({ city: place.city, country, opportunityCount: 1, topVenueCount: 1 })),
    sources: [{ id: "preview-fixture", name: "Preview fixture", type: "manual", opportunityCount: bookingOpportunities.length }],
    warnings: ["Preview data is active. These examples are deterministic and are not discovery results."],
  };
}
