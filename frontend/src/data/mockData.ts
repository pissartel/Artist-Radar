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
    id: "le-transbordeur",
    title: "Le Transbordeur",
    type: "venue",
    location: "Lyon, France",
    city: "Lyon",
    country: "France",
    description:
      "Primary metalcore venue in Lyon with strong genre alignment and active booking calendar.",
    tags: ["metalcore", "local"],
    matchScore: 91,
    matchReasons: ["Primary metalcore venue in Lyon", "Strong genre alignment"],
  },
  {
    id: "la-maroquinerie",
    title: "La Maroquinerie",
    type: "venue",
    location: "Paris, France",
    city: "Paris",
    country: "France",
    description:
      "Books post-hardcore and metalcore acts regularly; similar artists have performed here.",
    tags: ["metalcore", "post-hardcore"],
    matchScore: 84,
    matchReasons: [
      "Regular post-hardcore and metalcore bookings",
      "Similar artists have performed here",
    ],
  },
  {
    id: "rock-school-barbey",
    title: "Rock School Barbey",
    type: "venue",
    location: "Bordeaux, France",
    city: "Bordeaux",
    country: "France",
    description:
      "Regional venue known for supporting emerging heavy acts; genre match is strong.",
    tags: ["metalcore", "emerging"],
    matchScore: 77,
    matchReasons: ["Supports emerging heavy acts", "Strong genre match"],
  },
  {
    id: "le-molotov",
    title: "Le Molotov",
    type: "venue",
    location: "Marseille, France",
    city: "Marseille",
    country: "France",
    description:
      "Underground heavy music venue with a loyal local audience for the genre.",
    tags: ["underground", "heavy"],
    matchScore: 70,
    matchReasons: ["Underground heavy music venue", "Loyal local audience"],
  },
  {
    id: "stereolux",
    title: "Stereolux",
    type: "venue",
    location: "Nantes, France",
    city: "Nantes",
    country: "France",
    description:
      "Cross-genre venue with a dedicated metal programming slot each quarter.",
    tags: ["metal", "cross-genre"],
    matchScore: 65,
    matchReasons: ["Dedicated metal programming slot each quarter"],
  },
];
