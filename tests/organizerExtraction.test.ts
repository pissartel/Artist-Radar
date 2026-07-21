import { describe, expect, it } from "vitest";
import { extractOrganizerAndPromoter } from "../src/enrichment/organizerExtraction.js";

describe("extractOrganizerAndPromoter", () => {
  it("extracts an organizer name from an explicit label", () => {
    const result = extractOrganizerAndPromoter("Organisé par: Les Nuits Sonores\nDoors at 8pm.");
    expect(result.organizerName).toBe("Les Nuits Sonores");
  });

  it("extracts an organizer name from the English label", () => {
    const result = extractOrganizerAndPromoter("Organized by Sunset Booking Collective.");
    expect(result.organizerName).toBe("Sunset Booking Collective");
  });

  it("extracts a promoter name from an explicit label", () => {
    const result = extractOrganizerAndPromoter("Promoter: Wild Card Promotions\nTickets on sale now.");
    expect(result.promoterName).toBe("Wild Card Promotions");
  });

  it("falls back to an association label when no organizer label is present", () => {
    const result = extractOrganizerAndPromoter("Une organisation de Association Punk Locale.");
    expect(result.organizerName).toBe("Association Punk Locale");
  });

  it("never guesses an organizer from an unlabeled venue or artist name", () => {
    const result = extractOrganizerAndPromoter("Le Petit Club presents Band A live in concert.");
    expect(result.organizerName).toBeNull();
    expect(result.promoterName).toBeNull();
  });

  it("returns null for both fields on empty text", () => {
    expect(extractOrganizerAndPromoter("")).toEqual({ organizerName: null, promoterName: null });
  });
});
