export interface Artist {
  name: string;
  genre: string;
  city: string;
  score?: number;
}

export interface KPICard {
  label: string;
  value: string | number;
}

export interface BookingOpportunity {
  venue: string;
  city: string;
  score: number;
  reason: string;
}
