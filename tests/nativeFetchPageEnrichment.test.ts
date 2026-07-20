import { describe, expect, it, vi } from "vitest";
import { buildNativeFetchSceneAgendaProvider } from "../src/booking/providers/NativeFetchSceneAgendaProvider.js";
import type { BookingSearchInput } from "../src/booking/types.js";

const input: BookingSearchInput = {
  artist: "Tuesday Fall",
  city: "Rennes",
  genre: "punk",
  target: "France",
  links: [],
  limit: 5
};

const LISTING_URL = "https://razibus.net/evenements-a-venir.php";
const DETAIL_URL = "https://razibus.net/31-07-2026-soiree-punk-ferme-quince-rennes-35768.html";

describe("NativeFetchSceneAgendaProvider page enrichment (Razibus regression)", () => {
  it("recovers a real title and poster image when the listing only exposes a generic CTA link", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href === LISTING_URL) {
        return new Response(
          `<html><body><a href="${DETAIL_URL}">Voir la page de l'&eacute;v&egrave;nement</a></body></html>`,
          { status: 200 }
        ) as unknown as Response;
      }
      if (href === DETAIL_URL) {
        return new Response(
          `<html><head>
            <meta property="og:title" content="Soir&eacute;e Punk - Ferme de Quinc&eacute;" />
            <meta property="og:description" content="Concert punk &agrave; Rennes" />
            <meta property="og:image" content="https://razibus.net/img/poster-35768.jpg" />
          </head><body></body></html>`,
          { status: 200 }
        ) as unknown as Response;
      }
      return new Response("", { status: 404 }) as unknown as Response;
    });

    const provider = buildNativeFetchSceneAgendaProvider({
      env: {
        ENABLE_SCENE_AGENDAS: "true",
        ENABLE_RAZIBUS: "true",
        ENABLE_CONCERTS_PUNK: "false",
        ENABLE_PUNKNROLL_AGENDA: "false",
        RAZIBUS_URL: LISTING_URL
      },
      fetchImpl,
      now: new Date("2026-06-12T00:00:00Z")
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toHaveLength(1);
    const target = result.targets[0];
    expect(target.name.toLowerCase()).not.toContain("voir la page");
    expect(target.name).toContain("Ferme de Quinc");
    expect(target.imageUrl).toBe("https://razibus.net/img/poster-35768.jpg");
  });

  it("never blocks the opportunity when the detail-page fetch fails", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href === LISTING_URL) {
        return new Response(
          `<html><body><a href="${DETAIL_URL}">Voir la page de l'&eacute;v&egrave;nement</a></body></html>`,
          { status: 200 }
        ) as unknown as Response;
      }
      throw new Error("detail page unreachable");
    });

    const provider = buildNativeFetchSceneAgendaProvider({
      env: {
        ENABLE_SCENE_AGENDAS: "true",
        ENABLE_RAZIBUS: "true",
        ENABLE_CONCERTS_PUNK: "false",
        ENABLE_PUNKNROLL_AGENDA: "false",
        RAZIBUS_URL: LISTING_URL
      },
      fetchImpl,
      now: new Date("2026-06-12T00:00:00Z")
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].imageUrl ?? null).toBeNull();
  });
});
