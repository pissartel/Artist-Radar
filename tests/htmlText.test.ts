import { describe, expect, it } from "vitest";
import { cleanHtmlToText, extractHtmlTitle, isEmptyOrBoilerplateText } from "../src/knowledge/htmlText.js";

describe("cleanHtmlToText", () => {
  it("strips scripts, styles, and tags", () => {
    const html = `
      <html>
        <head><style>body { color: red; }</style><script>console.log("x")</script></head>
        <body>
          <h1>Le Sonic</h1>
          <p>Concert venue in Lyon booking metalcore and hardcore acts.</p>
        </body>
      </html>
    `;

    const text = cleanHtmlToText(html);

    expect(text).toContain("Le Sonic");
    expect(text).toContain("Concert venue in Lyon booking metalcore and hardcore acts.");
    expect(text).not.toContain("console.log");
    expect(text).not.toContain("color: red");
    expect(text).not.toMatch(/<[^>]+>/);
  });

  it("decodes common HTML entities", () => {
    const html = "<p>Rock &amp; Roll &mdash;? &quot;Le Sonic&quot;</p>".replace("&mdash;?", "");
    const text = cleanHtmlToText(html);
    expect(text).toContain("Rock & Roll");
    expect(text).toContain("\"Le Sonic\"");
  });
});

describe("extractHtmlTitle", () => {
  it("extracts the page title", () => {
    const html = "<html><head><title>Le Sonic - Venue</title></head><body></body></html>";
    expect(extractHtmlTitle(html)).toBe("Le Sonic - Venue");
  });

  it("returns null when there is no title", () => {
    expect(extractHtmlTitle("<html><body>No title here</body></html>")).toBeNull();
  });
});

describe("isEmptyOrBoilerplateText", () => {
  it("flags empty or very short text", () => {
    expect(isEmptyOrBoilerplateText("")).toBe(true);
    expect(isEmptyOrBoilerplateText("Cookies accepted.")).toBe(true);
  });

  it("flags repetitive boilerplate text", () => {
    const repetitive = "loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading loading";
    expect(isEmptyOrBoilerplateText(repetitive)).toBe(true);
  });

  it("accepts substantial, varied text", () => {
    const realContent = "Le Sonic is a concert venue in Lyon that regularly books metalcore, hardcore, and punk rock acts. Upcoming shows include local and touring bands across multiple genres, with a strong focus on emerging artists from the regional scene. Doors open at 7pm most weeknights and the venue has a capacity of around three hundred people.";
    expect(isEmptyOrBoilerplateText(realContent)).toBe(false);
  });
});
