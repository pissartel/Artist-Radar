import "dotenv/config";
import {
  buildFirecrawlWebSearchProvider,
  firecrawlScrapeUrl
} from "../src/services/firecrawlService.js";

async function main(): Promise<void> {
  const firecrawlApiKeyPresent = Boolean(process.env.FIRECRAWL_API_KEY);
  console.log(`Firecrawl API key present: ${firecrawlApiKeyPresent}`);

  if (!firecrawlApiKeyPresent) {
    console.log("Scrape: skipped (missing FIRECRAWL_API_KEY)");
    console.log("Search: skipped (missing FIRECRAWL_API_KEY)");
    return;
  }

  const env = {
    ...process.env,
    ENABLE_FIRECRAWL_CONSOLIDATION: "true"
  };

  const scrape = await firecrawlScrapeUrl("https://example.com", env);
  console.log(`Scrape: ${scrape.success ? "success" : "failure"}${scrape.status !== null ? ` (status ${scrape.status})` : ""}`);

  const provider = buildFirecrawlWebSearchProvider(env);
  if (!provider) {
    console.log("Search: failure (Firecrawl provider not enabled)");
    return;
  }

  const results = await provider.search('"Broad Peak" "pop punk" band', 5);
  console.log(`Search: ${results.length > 0 ? "success" : "failure"} (${results.length} results)`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Firecrawl smoke test failed: ${message}`);
  process.exitCode = 1;
});
