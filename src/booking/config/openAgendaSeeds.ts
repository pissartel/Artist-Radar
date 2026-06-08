export interface OpenAgendaLocationSeed {
  locationKey: string;
  city: string;
  region?: string;
  country: string;
  agendaUids: string[];
  keywords: string[];
  nearbyCities: string[];
  notes?: string;
}

const defaultMusicKeywords = ["concert", "musiques actuelles", "festival", "tremplin", "appel à candidature"];

export const OPENAGENDA_LOCATION_SEEDS: OpenAgendaLocationSeed[] = [
  {
    locationKey: "paris",
    city: "Paris",
    region: "Ile-de-France",
    country: "France",
    agendaUids: [],
    keywords: defaultMusicKeywords,
    nearbyCities: ["Montreuil", "Pantin", "Saint-Denis", "Ivry-sur-Seine"],
    notes: "Seed slot for verified Paris booking-relevant agenda UIDs."
  },
  {
    locationKey: "lyon",
    city: "Lyon",
    region: "Auvergne-Rhone-Alpes",
    country: "France",
    agendaUids: [],
    keywords: defaultMusicKeywords,
    nearbyCities: ["Villeurbanne"],
    notes: "Seed slot for verified Lyon booking-relevant agenda UIDs."
  },
  {
    locationKey: "marseille",
    city: "Marseille",
    region: "Provence-Alpes-Cote d'Azur",
    country: "France",
    agendaUids: [],
    keywords: defaultMusicKeywords,
    nearbyCities: ["Aix-en-Provence"],
    notes: "Seed slot for verified Marseille booking-relevant agenda UIDs."
  },
  {
    locationKey: "lille",
    city: "Lille",
    region: "Hauts-de-France",
    country: "France",
    agendaUids: [],
    keywords: defaultMusicKeywords,
    nearbyCities: ["Roubaix", "Tourcoing"],
    notes: "Seed slot for verified Lille booking-relevant agenda UIDs."
  },
  {
    locationKey: "nantes",
    city: "Nantes",
    region: "Pays de la Loire",
    country: "France",
    agendaUids: [],
    keywords: defaultMusicKeywords,
    nearbyCities: ["Rezé", "Saint-Herblain"],
    notes: "Seed slot for verified Nantes booking-relevant agenda UIDs."
  },
  {
    locationKey: "bordeaux",
    city: "Bordeaux",
    region: "Nouvelle-Aquitaine",
    country: "France",
    agendaUids: [],
    keywords: defaultMusicKeywords,
    nearbyCities: ["Mérignac", "Pessac", "Talence"],
    notes: "Seed slot for verified Bordeaux booking-relevant agenda UIDs."
  },
  {
    locationKey: "toulouse",
    city: "Toulouse",
    region: "Occitanie",
    country: "France",
    agendaUids: [],
    keywords: defaultMusicKeywords,
    nearbyCities: ["Blagnac"],
    notes: "Seed slot for verified Toulouse booking-relevant agenda UIDs."
  },
  {
    locationKey: "rennes",
    city: "Rennes",
    region: "Bretagne",
    country: "France",
    agendaUids: [],
    keywords: defaultMusicKeywords,
    nearbyCities: ["Cesson-Sévigné"],
    notes: "Seed slot for verified Rennes booking-relevant agenda UIDs."
  },
  {
    locationKey: "strasbourg",
    city: "Strasbourg",
    region: "Grand Est",
    country: "France",
    agendaUids: [],
    keywords: defaultMusicKeywords,
    nearbyCities: ["Schiltigheim"],
    notes: "Seed slot for verified Strasbourg booking-relevant agenda UIDs."
  },
  {
    locationKey: "montpellier",
    city: "Montpellier",
    region: "Occitanie",
    country: "France",
    agendaUids: [],
    keywords: defaultMusicKeywords,
    nearbyCities: [],
    notes: "Seed slot for verified Montpellier booking-relevant agenda UIDs."
  }
];
