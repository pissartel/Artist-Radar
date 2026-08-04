import { describe, expect, it } from "vitest";
import { classifyBookingTarget } from "../src/booking/classifyTarget.js";

describe("classifyBookingTarget", () => {
  it("keeps the venue default for a real venue keyword match with no explicit category", () => {
    const target = classifyBookingTarget({
      name: "Le Klub",
      text: "Le Klub is a concert hall in Paris",
      url: "https://leklub.fr"
    });
    expect(target.category).toBe("venue");
  });

  it("keeps the venue default when the source already resolved a real venue name", () => {
    const target = classifyBookingTarget({
      name: "Le Klub",
      text: "Le Klub",
      url: "https://leklub.fr",
      venueName: "Le Klub",
      sourceType: "official_site"
    });
    expect(target.category).toBe("venue");
  });

  it("does not default an unverified Instagram search result with no resolved venue name to venue", () => {
    // Reproduces the reported bug: an Instagram post caption about one show,
    // found via a bare web search with no page extraction (no venueName
    // resolved), must never be treated as a venue whose own post URL is then
    // shown as the venue's official website.
    const target = classifyBookingTarget({
      name: "PARIS - Pop punk Vendredi! Local legends @tuesdayfall and ...",
      text: "PARIS - Pop punk Vendredi! Local legends @tuesdayfall and ...",
      url: "https://www.instagram.com/p/DTizQeyCNWO/",
      sourceType: "search_result"
    });
    expect(target.category).not.toBe("venue");
    expect(target.category).toBe("event");
  });

  it("does not default an unverified generic listing-site search result with no resolved venue name to venue", () => {
    // A third-party French "agenda" listing page (not a known social
    // domain) whose own event text already contains the venue's name (e.g.
    // "au Café Charbon") must not be surfaced as if the listing page itself
    // were the venue's official site — the general "unverified search
    // result with no resolved venue identity" signal covers this even
    // though the domain isn't a known social/ticketing aggregator.
    const target = classifyBookingTarget({
      name: "Concert Pop-Punk et Pop-Électro au Café Charbon à Nevers",
      text: "Concert Pop-Punk et Pop-Électro au Café Charbon à Nevers",
      url: "https://www.koikispass.com/lagenda/19779/concert-ditter-par-sek-concert-musique-nevers/",
      sourceType: "search_result"
    });
    expect(target.category).not.toBe("venue");
    expect(target.category).toBe("event");
  });

  it("still defaults to venue for an unverified search result whose text names a real venue keyword", () => {
    const target = classifyBookingTarget({
      name: "Salle de concert à Nevers",
      text: "Salle de concert à Nevers",
      url: "https://www.koikispass.com/lagenda/19779/salle-de-concert-nevers/",
      sourceType: "search_result"
    });
    expect(target.category).toBe("venue");
  });
});
