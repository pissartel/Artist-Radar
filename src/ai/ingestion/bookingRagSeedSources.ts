import type { KnowledgeSourceType } from "../../knowledge/types.js";

export interface BookingRagSeedSource {
  name: string;
  type: KnowledgeSourceType;
  url: string;
  /**
   * Known to sit behind a bot-protection challenge (Cloudflare Managed
   * Challenge, Turnstile, Vercel challenge) that a plain fetch() cannot pass.
   * Forces the headless fallback when it is available.
   */
  requiresHeadless?: boolean;
}

export const BOOKING_RAG_SEED_SOURCES: BookingRagSeedSource[] = [
  {
    name: "Infoconcert Paris",
    type: "agenda",
    url: "https://www.infoconcert.com/ville/paris-5133",
    requiresHeadless: true
  },
  {
    name: "Shotgun Paris",
    type: "agenda",
    url: "https://shotgun.live/fr/cities/paris",
    requiresHeadless: true
  },
  {
    name: "Razibus",
    type: "agenda",
    url: "https://razibus.net/evenements-a-venir.php"
  },
  {
    name: "Punknroll Agenda",
    type: "agenda",
    url: "https://agenda.punknroll.fr/"
  },
  {
    name: "Concerts Punk",
    type: "agenda",
    url: "https://www.concertspunk.fr/?country=fr"
  },
  {
    name: "Concerts Metal",
    type: "agenda",
    url: "https://www.concerts-metal.com/",
    requiresHeadless: true
  }
];
