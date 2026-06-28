import type { Artist, BookingOpportunity, KPICard } from "@/types";

export const currentArtist: Artist = {
  name: "Fake Band",
  genre: "Metalcore",
  city: "Lyon",
};

export const kpiCards: KPICard[] = [
  { label: "Similar Artists Found", value: 6 },
  { label: "Booking Opportunities", value: 5 },
  { label: "Venues Nearby", value: 12 },
  { label: "Events This Month", value: 3 },
];

export const similarArtists: Artist[] = [
  { name: "Hollow Crown", genre: "Metalcore", city: "Paris", score: 92 },
  { name: "Iron Veil", genre: "Post-Hardcore", city: "Lyon", score: 85 },
  { name: "Broken Signal", genre: "Metalcore", city: "Bordeaux", score: 78 },
  { name: "Dead Letters", genre: "Hardcore", city: "Marseille", score: 74 },
  { name: "Static Wound", genre: "Deathcore", city: "Nantes", score: 69 },
  { name: "Rust & Ruin", genre: "Post-Metal", city: "Grenoble", score: 63 },
];

export const bookingOpportunities: BookingOpportunity[] = [
  {
    venue: "Le Transbordeur",
    city: "Lyon",
    score: 91,
    reason: "Primary metalcore venue in Lyon with strong genre alignment and active booking calendar.",
  },
  {
    venue: "La Maroquinerie",
    city: "Paris",
    score: 84,
    reason: "Books post-hardcore and metalcore acts regularly; similar artists have performed here.",
  },
  {
    venue: "Rock School Barbey",
    city: "Bordeaux",
    score: 77,
    reason: "Regional venue known for supporting emerging heavy acts; genre match is strong.",
  },
  {
    venue: "Le Molotov",
    city: "Marseille",
    score: 70,
    reason: "Underground heavy music venue with a loyal local audience for the genre.",
  },
  {
    venue: "Stereolux",
    city: "Nantes",
    score: 65,
    reason: "Cross-genre venue with a dedicated metal programming slot each quarter.",
  },
];
