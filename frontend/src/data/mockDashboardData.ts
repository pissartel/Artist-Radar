import type {
  ArtistProfile,
  BookingOpportunity,
  BookingSource,
  CityOpportunityStat,
  DashboardData,
  KpiMetric,
  SimilarArtist,
} from "@/types";

const artist: ArtistProfile = {
  id: "bad-frequencies",
  name: "Bad Frequencies",
  genres: ["Pop Punk", "Emo Pop"],
  location: "Bordeaux, France",
  city: "Bordeaux",
  country: "France",
  monthlyListeners: 24500,
  growthPercent: 12,
};

const kpis: KpiMetric[] = [
  { id: "similar-artists", label: "Similar Artists Found", value: 8 },
  { id: "booking-opportunities", label: "Booking Opportunities", value: 6 },
  { id: "venues-nearby", label: "Venues Nearby", value: 14 },
  { id: "monthly-listeners", label: "Monthly Listeners", value: "24.5K" },
];

const similarArtists: SimilarArtist[] = [
  {
    id: "pale-waves",
    name: "Pale Waves",
    genres: ["Emo Pop", "Indie Pop"],
    location: "Manchester, UK",
    matchScore: 91,
  },
  {
    id: "waterparks",
    name: "Waterparks",
    genres: ["Pop Punk", "Pop Rock"],
    location: "Houston, USA",
    matchScore: 87,
  },
  {
    id: "grayscale",
    name: "Grayscale",
    genres: ["Pop Punk", "Emo"],
    location: "Philadelphia, USA",
    matchScore: 82,
  },
  {
    id: "the-wonder-years",
    name: "The Wonder Years",
    genres: ["Pop Punk", "Punk Rock"],
    location: "Philadelphia, USA",
    matchScore: 78,
  },
  {
    id: "notre-dame",
    name: "Notre Dame",
    genres: ["Pop Punk", "Melodic Punk"],
    location: "Bordeaux, France",
    matchScore: 74,
  },
  {
    id: "chunk-no-captain-chunk",
    name: "Chunk! No, Captain Chunk!",
    genres: ["Pop Punk", "Post-Hardcore"],
    location: "Paris, France",
    matchScore: 69,
  },
];

const bookingOpportunities: BookingOpportunity[] = [
  {
    id: "rock-school-barbey",
    title: "Rock School Barbey",
    type: "venue",
    location: "Bordeaux, France",
    city: "Bordeaux",
    country: "France",
    description:
      "Primary independent rock venue in Bordeaux with a strong track record booking emerging pop punk and emo pop acts. Direct genre alignment and local artist affinity.",
    tags: ["pop punk", "emo pop", "local", "emerging"],
    matchScore: 93,
    matchReasons: [
      "Genre alignment: Pop Punk and Emo Pop are regularly booked",
      "Local venue in artist home city",
      "Similar artists have performed here",
    ],
    source: "songkick",
  },
  {
    id: "la-maroquinerie",
    title: "La Maroquinerie",
    type: "venue",
    location: "Paris, France",
    city: "Paris",
    country: "France",
    description:
      "Established mid-capacity venue in Paris known for booking indie and alternative acts. Several comparable Pop Punk artists have played here in the last 12 months.",
    tags: ["indie", "pop punk", "mid-capacity"],
    matchScore: 85,
    matchReasons: [
      "Comparable artists booked in the past year",
      "Active booking calendar for the genre",
    ],
    source: "bandsintown",
  },
  {
    id: "hellfest-open-air",
    title: "Hellfest Open Air — Valley Stage",
    type: "festival",
    location: "Clisson, France",
    city: "Clisson",
    country: "France",
    description:
      "France's largest rock and metal festival includes a Valley Stage dedicated to lighter alternative rock and pop punk. Strong French artist representation.",
    tags: ["festival", "pop punk", "alternative", "french artists"],
    matchScore: 78,
    matchReasons: [
      "Festival includes pop punk and emo acts on the Valley stage",
      "French artists given priority consideration",
    ],
    source: "manual",
  },
  {
    id: "le-transbordeur",
    title: "Le Transbordeur",
    type: "venue",
    location: "Lyon, France",
    city: "Lyon",
    country: "France",
    description:
      "One of the most active alternative music venues in Lyon. Pop punk and emo pop acts are regularly featured in the programming.",
    tags: ["alternative", "emo pop", "pop punk"],
    matchScore: 74,
    matchReasons: [
      "Active pop punk programming",
      "Second largest city in alternative music scene",
    ],
    source: "songkick",
  },
  {
    id: "nantes-opening-slot",
    title: "Opening Slot — Stereolux (Nantes)",
    type: "opening_slot",
    location: "Nantes, France",
    city: "Nantes",
    country: "France",
    description:
      "Stereolux regularly pairs emerging local acts with touring international artists. Genre match makes this an accessible entry point for the Western France market.",
    tags: ["opening slot", "emo pop", "emerging", "western france"],
    matchScore: 68,
    matchReasons: [
      "Venue supports emerging French acts as openers",
      "Genre crossover with resident touring acts",
    ],
    source: "bandsintown",
  },
  {
    id: "le-bikini",
    title: "Le Bikini",
    type: "venue",
    location: "Toulouse, France",
    city: "Toulouse",
    country: "France",
    description:
      "Major alternative venue in Toulouse with quarterly pop punk programming slots. Good regional reach in the South-West France market.",
    tags: ["pop punk", "alternative", "south-west france"],
    matchScore: 63,
    matchReasons: [
      "Quarterly genre-dedicated programming",
      "Regional proximity to Bordeaux",
    ],
    source: "songkick",
  },
];

const topCities: CityOpportunityStat[] = [
  { city: "Bordeaux", country: "France", opportunityCount: 4, topVenueCount: 2 },
  { city: "Paris", country: "France", opportunityCount: 8, topVenueCount: 5 },
  { city: "Lyon", country: "France", opportunityCount: 5, topVenueCount: 3 },
  { city: "Nantes", country: "France", opportunityCount: 3, topVenueCount: 2 },
  { city: "Toulouse", country: "France", opportunityCount: 3, topVenueCount: 2 },
];

const sources: BookingSource[] = [
  {
    id: "songkick",
    name: "Songkick",
    url: "https://www.songkick.com",
    type: "concert_discovery",
  },
  {
    id: "bandsintown",
    name: "Bandsintown",
    url: "https://www.bandsintown.com",
    type: "concert_discovery",
  },
  {
    id: "manual",
    name: "Manual Research",
    type: "manual",
  },
];

export const mockDashboardData: DashboardData = {
  artist,
  kpis,
  similarArtists,
  bookingOpportunities,
  topCities,
  sources,
};
