import { describe, expect, it } from "vitest";
import { extractPageMetadata } from "../src/booking/pageMetadata.js";

describe("extractPageMetadata", () => {
  it("extracts og:title, og:description and og:image", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Soir&eacute;e Punk - Ferme de Quinc&eacute;" />
        <meta property="og:description" content="Concert punk &agrave; Rennes" />
        <meta property="og:image" content="https://razibus.net/img/poster-35768.jpg" />
      </head><body></body></html>
    `;
    const result = extractPageMetadata(html);
    expect(result.title).toBe("Soirée Punk - Ferme de Quincé");
    expect(result.description).toBe("Concert punk à Rennes");
    expect(result.imageUrl).toBe("https://razibus.net/img/poster-35768.jpg");
  });

  it("falls back to twitter:image when og:image is absent", () => {
    const html = `<meta name="twitter:image" content="https://example.test/poster.png" />`;
    expect(extractPageMetadata(html).imageUrl).toBe("https://example.test/poster.png");
  });

  it("extracts image and performers from JSON-LD Event data", () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"Event","name":"Show","description":"A great show",
         "image":"https://example.test/jsonld-poster.jpg",
         "performer":[{"@type":"MusicGroup","name":"Band A"},{"@type":"MusicGroup","name":"Band B"}]}
      </script>
    `;
    const result = extractPageMetadata(html);
    expect(result.imageUrl).toBe("https://example.test/jsonld-poster.jpg");
    expect(result.performers).toEqual(["Band A", "Band B"]);
  });

  it("rejects unsafe image URL schemes", () => {
    const html = `<meta property="og:image" content="javascript:alert(1)" />`;
    expect(extractPageMetadata(html).imageUrl).toBeNull();
  });

  it("returns nulls and an empty performer list when no metadata is present", () => {
    const result = extractPageMetadata("<html><body>No metadata here</body></html>");
    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
    expect(result.imageUrl).toBeNull();
    expect(result.performers).toEqual([]);
  });

  it("never throws on malformed JSON-LD", () => {
    const html = `<script type="application/ld+json">{ not valid json </script>`;
    expect(() => extractPageMetadata(html)).not.toThrow();
  });
});
