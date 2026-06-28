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
    id: "neck-deep-guests",
    title: "Neck Deep + Guests",
    type: "opening_slot",
    location: "Bordeaux, France",
    city: "Bordeaux",
    country: "France",
    description: "Possible opening slot on European tour",
    tags: ["Pop Punk", "Emo Pop", "UK"],
    matchScore: 92,
    matchReasons: ["Similar music style", "Similar audience", "Same region"],
  },
  {
    id: "le-rocher-de-palmer",
    title: "Le Rocher de Palmer",
    type: "venue",
    location: "Cenon, France",
    city: "Cenon",
    country: "France",
    description: "Venue highly matching your profile",
    tags: ["Pop Punk", "Indie Rock", "Alternative"],
    matchScore: 91,
    matchReasons: ["Similar venues history", "Capacity match", "Same city/region"],
  },
  {
    id: "xtreme-fest-2025",
    title: "Xtreme Fest 2025",
    type: "festival",
    location: "Cap Découverte, France",
    city: "Cap Découverte",
    country: "France",
    description: "Festival with similar artists in the lineup",
    tags: ["Pop Punk", "Metalcore", "Punk Rock"],
    matchScore: 89,
    matchReasons: ["Similar artists played", "Good style fit", "Call for applications open"],
  },
  {
    id: "darkest-hour-guests",
    title: "Darkest Hour + Guests",
    type: "opening_slot",
    location: "Lyon, France",
    city: "Lyon",
    country: "France",
    description: "No opening act announced yet",
    tags: ["Metalcore", "Hardcore"],
    matchScore: 87,
    matchReasons: ["Looking for opener", "Style compatible", "Geographic relevance"],
  },
];

const topCities: CityOpportunityStat[] = [
  { city: "Bordeaux", country: "France", opportunityCount: 4, topVenueCount: 2, percentage: 28 },
  { city: "Paris", country: "France", opportunityCount: 8, topVenueCount: 5, percentage: 18 },
  { city: "Lyon", country: "France", opportunityCount: 5, topVenueCount: 3, percentage: 16 },
  { city: "Nantes", country: "France", opportunityCount: 3, topVenueCount: 2, percentage: 12 },
  { city: "Toulouse", country: "France", opportunityCount: 3, topVenueCount: 2, percentage: 9 },
];

const sources: BookingSource[] = [
  {
    id: "bandsintown",
    name: "Bandsintown",
    url: "https://www.bandsintown.com",
    type: "concert_discovery",
    opportunityCount: 18,
  },
  {
    id: "songkick",
    name: "Songkick",
    url: "https://www.songkick.com",
    type: "concert_discovery",
    opportunityCount: 14,
  },
  {
    id: "venue-websites",
    name: "Venue websites",
    type: "manual",
    opportunityCount: 9,
  },
  {
    id: "festivals-official-sites",
    name: "Festivals official sites",
    type: "manual",
    opportunityCount: 7,
  },
  {
    id: "news-blogs",
    name: "News / Blogs",
    type: "manual",
    opportunityCount: 4,
  },
];

const matchExplanations: string[] = [
  "Similar music style",
  "Comparable audience",
  "Similar venue history",
  "Geographic relevance",
  "Active in the same circuit",
];

export const mockDashboardData: DashboardData = {
  artist,
  kpis,
  similarArtists,
  bookingOpportunities,
  topCities,
  sources,
  matchExplanations,
};
