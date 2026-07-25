import { describe, expect, it } from "vitest";
import {
  buildGenreBookerQueries,
  buildGeographicBookerQueries,
  buildBookerDirectoryQueries,
  buildSimilarArtistBookerQueries
} from "../src/bookers/bookerDiscoveryQueries.js";

describe("buildGenreBookerQueries", () => {
  it("generates genre-specialization queries covering booking agencies and independent promoters", () => {
    const queries = buildGenreBookerQueries("pop punk", "France").join(" | ");
    expect(queries).toMatch(/booking agency/i);
    expect(queries).toMatch(/agence de booking/i);
    expect(queries).toMatch(/independent promoter/i);
    expect(queries).toMatch(/emerging artists/i);
    expect(queries).toContain("France");
  });
});

describe("buildSimilarArtistBookerQueries", () => {
  it("builds queries tying a similar artist to its booking representation", () => {
    const queries = buildSimilarArtistBookerQueries("Thru It All");
    expect(queries.some((q) => q.includes('"Thru It All"') && q.includes("booking agency"))).toBe(true);
    expect(queries.some((q) => q.includes("represented by"))).toBe(true);
    expect(queries.some((q) => q.includes("booked by"))).toBe(true);
  });
});

describe("buildGeographicBookerQueries", () => {
  it("covers local, national and international/remote-open discovery, plus venue/festival partners", () => {
    const queries = buildGeographicBookerQueries("pop punk", "Paris", "France").join(" | ");
    expect(queries).toContain("Paris");
    expect(queries).toContain("France");
    expect(queries).toMatch(/international/i);
    expect(queries).toMatch(/worldwide roster/i);
    expect(queries).toMatch(/venue and festival partners/i);
  });
});

describe("buildBookerDirectoryQueries", () => {
  it("covers regional music-industry directories and public agency profiles", () => {
    const queries = buildBookerDirectoryQueries("pop punk", "France").join(" | ");
    expect(queries).toMatch(/directory/i);
    expect(queries).toMatch(/annuaire/i);
    expect(queries).toMatch(/roster booking agency profiles/i);
  });
});
