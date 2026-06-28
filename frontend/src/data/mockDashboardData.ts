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
  verified: true,
  platforms: [
    { type: "spotify" },
    { type: "instagram" },
    { type: "youtube" },
    { type: "website" },
  ],
};

const kpis: KpiMetric[] = [
  { id: "compatible-venues", label: "Compatible Venues", value: 14 },
  { id: "concerts-found", label: "Concerts Found", value: 6 },
  { id: "festivals", label: "Festivals", value: 3 },
  { id: "similar-artists", label: "Similar Artists", value: 8 },
  { id: "contacts-found", label: "Contacts Found", value: 11 },
  { id: "avg-match-score", label: "Avg Match Score", value: 76, unit: "%" },
];

const similarArtists: SimilarArtist[] = [
  {
    id: "neck-deep",
    name: "Neck Deep",
    genres: ["Pop Punk"],
    location: "Wrexham, UK",
    matchScore: 91,
  },
  {
    id: "wstr",
    name: "WSTR",
    genres: ["Pop Punk"],
    location: "Liverpool, UK",
    matchScore: 88,
  },
  {
    id: "belmont",
    name: "Belmont",
    genres: ["Emo Pop"],
    location: "Chicago, US",
    matchScore: 85,
  },
  {
    id: "hot-mulligan",
    name: "Hot Mulligan",
    genres: ["Emo", "Pop Punk"],
    location: "Michigan, US",
    matchScore: 80,
  },
  {
    id: "daisy-grenade",
    name: "Daisy Grenade",
    genres: ["Pop Punk"],
    location: "Toronto, CA",
    matchScore: 80,
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
