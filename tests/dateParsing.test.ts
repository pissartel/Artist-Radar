import { describe, expect, it } from "vitest";
import { extractEventDate } from "../src/booking/dateParsing.js";

const REFERENCE_DATE = new Date("2026-07-05T00:00:00Z");

describe("extractEventDate", () => {
  it("parses ISO dates", () => {
    expect(extractEventDate("Concert le 2026-06-12 a Paris", REFERENCE_DATE)).toBe("2026-06-12");
  });

  it("parses DD/MM/YYYY dates", () => {
    expect(extractEventDate("Concert le 12/06/2026", REFERENCE_DATE)).toBe("2026-06-12");
  });

  it("parses DD/MM dates without a year, rolling forward when already past", () => {
    expect(extractEventDate("Concert 12/06 salle X", REFERENCE_DATE)).toBe("2027-06-12");
  });

  it("parses DD/MM dates without a year, keeping the current year when upcoming", () => {
    expect(extractEventDate("Concert 14/09 salle X", REFERENCE_DATE)).toBe("2026-09-14");
  });

  it("parses French weekday + day + month names", () => {
    expect(extractEventDate("vendredi 12 juin", REFERENCE_DATE)).toBe("2027-06-12");
  });

  it("parses abbreviated French weekday + day + abbreviated month", () => {
    expect(extractEventDate("sam. 14 sept.", REFERENCE_DATE)).toBe("2026-09-14");
  });

  it("parses French written dates with an explicit year", () => {
    expect(extractEventDate("lundi 3 mars 2027", REFERENCE_DATE)).toBe("2027-03-03");
  });

  it("parses accented French month names", () => {
    expect(extractEventDate("Concert le 5 février 2027", REFERENCE_DATE)).toBe("2027-02-05");
  });

  it("handles '1er' ordinal day prefixes", () => {
    expect(extractEventDate("1er juin", REFERENCE_DATE)).toBe("2027-06-01");
  });

  it("returns null when no date can be found", () => {
    expect(extractEventDate("Programmation a venir, restez connectes", REFERENCE_DATE)).toBeNull();
  });

  it("rejects invalid calendar dates", () => {
    expect(extractEventDate("31/02/2026", REFERENCE_DATE)).toBeNull();
  });

  it("prefers the ISO/European numeric match over an unrelated number+word pair", () => {
    expect(extractEventDate("12/06/2026, salle 3 ouverture", REFERENCE_DATE)).toBe("2026-06-12");
  });
});
