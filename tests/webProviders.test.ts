import { describe, expect, it, vi } from "vitest";
import { consolidateArtistCandidate } from "../src/services/artistConsolidationService.js";
import {
  buildDefaultWebExtractProvider,
  buildDefaultWebSearchProvider,
  FallbackExtractProvider,
  FirecrawlExtractProvider
} from "../src/providers/web/providers.js";
import type { WebExtractProvider } from "../src/providers/web/WebExtractProvider.js";
import type { WebSearchProvider } from "../src/providers/web/WebSearchProvider.js";
import type { ArtistProfile } from "../src/schemas.js";

const profile: ArtistProfile = {
  artistName: "Tuesday Fall",
  city: "Paris",
  country: "France",
  genres: ["pop punk"],
  spotifyArtistName: "Tuesday Fall",
  spotifyGenres: ["pop punk"],
  socialLinks: { spotifyUrl: null, youtubeUrl: null, instagramUrl: null },
  platformStats: {},
  estimatedLevel: "emerging",
  confidence: 0.7,
  notes: []
};

describe("web providers", () => {
  it("chooses Tavily before Firecrawl for search", () => {
    const provider = buildDefaultWebSearchProvider({
      ENABLE_TAVILY_SEARCH: "true",
      TAVILY_API_KEY: "tavily-key",
      ENABLE_FIRECRAWL_CONSOLIDATION: "true",
      FIRECRAWL_API_KEY: "firecrawl-key"
    });

    expect(provider.providerName).toBe("tavily");
  });

  it("returns Noop when no search provider is enabled", async () => {
    const provider = buildDefaultWebSearchProvider({
      ENABLE_TAVILY_SEARCH: "false",
      ENABLE_EXA_SEARCH: "false",
      ENABLE_FIRECRAWL_CONSOLIDATION: "false"
    });

    expect(provider.providerName).toBe("noop");
    await expect(provider.search("anything")).resolves.toEqual([]);
  });

  it("Firecrawl disabled does not break consolidation", async () => {
    const result = await consolidateArtistCandidate(
      {
        name: "No Provider Band",
        genres: [],
        sources: ["lastfm_similar"],
        sourceUrls: []
      },
      {
        profile,
        userGenres: ["pop punk"],
        city: "Paris",
        target: "France",
        spotifySearch: async () => [],
        lastfmArtistInfo: async () => null,
        musicBrainzSearch: async () => null,
        env: {
          ENABLE_FIRECRAWL_CONSOLIDATION: "false",
          ENABLE_TAVILY_SEARCH: "false",
          ENABLE_EXA_SEARCH: "false"
        }
      }
    );

    expect(result.verificationStatus).toBe("needs_verification");
    expect(result.sourceUrls).toEqual([]);
  });

  it("respects query and extraction page limits", async () => {
    const queries: string[] = [];
    const extractedUrls: string[] = [];
    const webSearchProvider: WebSearchProvider = {
      providerName: "test-search",
      async search(query) {
        queries.push(query);
        return [
          {
            title: "Limited Band official",
            url: "https://example.com/limited-band",
            snippet: "Limited Band official page",
            sourceProvider: "test-search",
            confidence: 0.8,
            links: ["https://example.com/limited-band/extra"]
          }
        ];
      }
    };
    const webExtractProvider: WebExtractProvider = {
      providerName: "test-extract",
      async extract(url) {
        extractedUrls.push(url);
        return {
          url,
          title: "Limited Band",
          text: "Limited Band are a French pop punk band.",
          markdown: "Limited Band are a French pop punk band.",
          sourceProvider: "test-extract",
          statusCode: 200
        };
      }
    };

    const result = await consolidateArtistCandidate(
      {
        name: "Limited Band",
        genres: [],
        sources: ["lastfm_similar"],
        sourceUrls: []
      },
      {
        profile,
        userGenres: ["pop punk"],
        city: "Paris",
        target: "France",
        spotifySearch: async () => [],
        lastfmArtistInfo: async () => null,
        musicBrainzSearch: async () => null,
        webSearchProvider,
        webExtractProvider,
        env: {
          WEB_SEARCH_MAX_QUERIES_PER_CANDIDATE: "2",
          WEB_SEARCH_MAX_RESULTS_PER_QUERY: "5",
          WEB_EXTRACT_MAX_PAGES_PER_CANDIDATE: "1"
        }
      }
    );

    expect(queries).toHaveLength(2);
    expect(extractedUrls).toHaveLength(1);
    expect(result.genreEvidence.some((entry) => entry.source === "test-extract")).toBe(true);
  });

  it("uses generic WebSearchProvider during consolidation", async () => {
    const search = vi.fn(async () => [
      {
        title: "Generic Provider Band Instagram",
        url: "https://example.com/generic-provider-band",
        snippet: "Generic Provider Band https://www.instagram.com/genericproviderband/",
        sourceProvider: "generic-provider",
        confidence: 0.8,
        links: ["https://www.instagram.com/genericproviderband/"]
      }
    ]);

    const result = await consolidateArtistCandidate(
      {
        name: "Generic Provider Band",
        genres: [],
        sources: ["lastfm_similar"],
        sourceUrls: []
      },
      {
        profile,
        userGenres: ["pop punk"],
        city: "Paris",
        target: "France",
        spotifySearch: async () => [],
        lastfmArtistInfo: async () => null,
        musicBrainzSearch: async () => null,
        webSearchProvider: { providerName: "generic-provider", search },
        webExtractProvider: null,
        env: { WEB_SEARCH_MAX_QUERIES_PER_CANDIDATE: "1" }
      }
    );

    expect(search).toHaveBeenCalled();
    expect(result.instagramHandle).toBe("genericproviderband");
  });
});

describe("FirecrawlExtractProvider", () => {
  it("requests markdown, rawHtml and links formats, and populates html/links on the result", async () => {
    let capturedBody: unknown = null;
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return new Response(
        JSON.stringify({
          data: {
            markdown: "# Agenda",
            rawHtml: "<html><head><title>Agenda | Quai M</title></head><body></body></html>",
            links: ["https://quai-m.fr/event/band-a"],
            metadata: { title: "Agenda" }
          }
        }),
        { status: 200 }
      );
    });

    const provider = new FirecrawlExtractProvider({ FIRECRAWL_API_KEY: "test-key" }, fetchImpl as unknown as typeof fetch);
    const result = await provider.extract("https://quai-m.fr/agenda");

    expect(capturedBody).toMatchObject({ formats: ["markdown", "rawHtml", "links"], onlyMainContent: true });
    expect(result?.html).toBe("<html><head><title>Agenda | Quai M</title></head><body></body></html>");
    expect(result?.links).toEqual(["https://quai-m.fr/event/band-a"]);
    expect(result?.markdown).toBe("# Agenda");
  });

  it("returns null without calling fetch when no API key is configured", async () => {
    const fetchImpl = vi.fn();
    const provider = new FirecrawlExtractProvider({}, fetchImpl as unknown as typeof fetch);

    const result = await provider.extract("https://quai-m.fr/agenda");

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("marks Firecrawl quota exhaustion so a fallback chain can skip it for the rest of the run", async () => {
    const firecrawl = new FirecrawlExtractProvider(
      { FIRECRAWL_API_KEY: "test-key" },
      async () => new Response("quota exhausted - payment required", { status: 402 }) as unknown as Response
    );
    const jina: WebExtractProvider = {
      providerName: "jina",
      async extract(url) {
        return {
          url,
          title: "Jina page",
          text: "Jina fallback extracted a sufficiently long venue page with pop punk programming in Paris, France.",
          markdown: "Jina fallback extracted a sufficiently long venue page with pop punk programming in Paris, France.",
          sourceProvider: "jina",
          statusCode: 200
        };
      }
    };
    const chain = new FallbackExtractProvider([firecrawl, jina]);

    const first = await chain.extract("https://example.test/venue");
    const second = await chain.extract("https://example.test/venue-2");

    expect(first?.sourceProvider).toBe("jina");
    expect(second?.sourceProvider).toBe("jina");
    expect(chain.diagnostics.extractionProviders.firecrawl).toBe("quota_exhausted");
    expect(chain.diagnostics.attempts.some((attempt) => attempt.providerName === "firecrawl" && attempt.status === "skipped")).toBe(true);
  });

  it("falls back from native fetch to Jina when native content is insufficient", async () => {
    const native: WebExtractProvider = {
      providerName: "nativeFetch",
      async extract() {
        return null;
      }
    };
    const jina: WebExtractProvider = {
      providerName: "jina",
      async extract(url) {
        return {
          url,
          title: "Jina venue",
          text: "Jina Reader returned enough text about a Paris venue programming pop punk and punk rock concerts.",
          markdown: "Jina Reader returned enough text about a Paris venue programming pop punk and punk rock concerts.",
          sourceProvider: "jina",
          statusCode: 200
        };
      }
    };

    const result = await new FallbackExtractProvider([native, jina]).extract("https://example.test/venue");

    expect(result?.sourceProvider).toBe("jina");
  });

  it("uses browser extraction only after lighter extractors fail", async () => {
    const calls: string[] = [];
    const native: WebExtractProvider = { providerName: "nativeFetch", async extract() { calls.push("nativeFetch"); return null; } };
    const jina: WebExtractProvider = { providerName: "jina", async extract() { calls.push("jina"); return null; } };
    const browser: WebExtractProvider = {
      providerName: "browser",
      async extract(url) {
        calls.push("browser");
        return {
          url,
          title: "Rendered venue",
          text: "Browser rendered enough dynamic page content for a Paris venue with pop punk programming evidence.",
          markdown: null,
          html: "<html><body>Browser rendered enough dynamic page content for a Paris venue with pop punk programming evidence.</body></html>",
          sourceProvider: "browser",
          statusCode: 200
        };
      }
    };

    const result = await new FallbackExtractProvider([native, jina, browser]).extract("https://example.test/dynamic");

    expect(result?.sourceProvider).toBe("browser");
    expect(calls).toEqual(["nativeFetch", "jina", "browser"]);
  });
});
