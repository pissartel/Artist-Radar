import { describe, expect, it } from "vitest";
import {
  buildGenreLabelQueries,
  buildGeographicLabelQueries,
  buildLabelDirectoryQueries,
  buildSimilarArtistLabelQueries
} from "../src/labels/labelDiscoveryQueries.js";

describe("buildGenreLabelQueries", () => {
  it("generates genre-specialization queries covering independent and net-labels", () => {
    const queries = buildGenreLabelQueries("pop punk", "France").join(" | ");
    expect(queries).toMatch(/record label/i);
    expect(queries).toMatch(/independent label/i);
    expect(queries).toMatch(/label ind[ée]pendant/i);
    expect(queries).toMatch(/netlabel/i);
    expect(queries).toMatch(/demos/i);
    expect(queries).toContain("France");
  });
});

describe("buildSimilarArtistLabelQueries", () => {
  it("builds queries tying a similar artist to its label", () => {
    const queries = buildSimilarArtistLabelQueries("Thru It All");
    expect(queries.some((q) => q.includes('"Thru It All"') && q.includes("record label"))).toBe(true);
    expect(queries.some((q) => q.includes("signed to"))).toBe(true);
  });
});

describe("buildGeographicLabelQueries", () => {
  it("covers local, national and international/remote-open discovery", () => {
    const queries = buildGeographicLabelQueries("pop punk", "Paris", "France").join(" | ");
    expect(queries).toContain("Paris");
    expect(queries).toContain("France");
    expect(queries).toMatch(/international/i);
    expect(queries).toMatch(/worldwide roster/i);
  });
});

describe("buildLabelDirectoryQueries", () => {
  it("covers public directories and distributor/collective sources", () => {
    const queries = buildLabelDirectoryQueries("pop punk", "France").join(" | ");
    expect(queries).toMatch(/directory/i);
    expect(queries).toMatch(/annuaire/i);
    expect(queries).toMatch(/distributor/i);
  });
});
