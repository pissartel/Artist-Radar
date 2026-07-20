import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "../src/utils/htmlEntities.js";

describe("decodeHtmlEntities", () => {
  it("decodes accented named entities", () => {
    expect(decodeHtmlEntities("Voir la page de l'&eacute;v&egrave;nement")).toBe(
      "Voir la page de l'évènement"
    );
  });

  it("decodes &amp;", () => {
    expect(decodeHtmlEntities("Rock &amp; Roll")).toBe("Rock & Roll");
  });

  it("decodes decimal numeric entities like &#39;", () => {
    expect(decodeHtmlEntities("l&#39;&eacute;v&egrave;nement")).toBe("l'évènement");
  });

  it("decodes &quot;", () => {
    expect(decodeHtmlEntities("&quot;Le Sonic&quot;")).toBe("\"Le Sonic\"");
  });

  it("decodes hexadecimal numeric entities", () => {
    expect(decodeHtmlEntities("&#x27;caf&#xe9;&#x27;")).toBe("'café'");
  });

  it("leaves plain text untouched", () => {
    expect(decodeHtmlEntities("Ferme de Quincé")).toBe("Ferme de Quincé");
  });

  it("leaves unknown entities untouched", () => {
    expect(decodeHtmlEntities("&unknownentity;")).toBe("&unknownentity;");
  });
});
