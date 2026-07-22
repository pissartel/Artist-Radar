import type { SimilarArtist } from "../../schemas.js";
import type { TicketmasterArtistResolution } from "./attractionResolution.js";
import type { TicketmasterConcert } from "./normalizeTicketmasterEvent.js";
import type { TicketmasterDiagnostics } from "./TicketmasterClient.js";

/**
 * Shared between TicketmasterBookingSourceProvider (which produces these)
 * and ticketmasterEvidence.ts / pipeline.ts (which consume them). Kept in
 * its own file so none of those modules have to import each other.
 */
export interface SimilarArtistTicketmasterEvents {
  artist: SimilarArtist;
  attractionResolution: TicketmasterArtistResolution;
  pastEvents: TicketmasterConcert[];
  upcomingEvents: TicketmasterConcert[];
}

export interface TicketmasterSearchOutcome {
  genreLocationEvents: TicketmasterConcert[];
  similarArtistEvents: SimilarArtistTicketmasterEvents[];
  diagnostics: TicketmasterDiagnostics;
}
