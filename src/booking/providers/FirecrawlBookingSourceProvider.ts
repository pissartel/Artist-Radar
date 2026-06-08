import {
  FirecrawlExtractProvider,
  FirecrawlSearchProvider,
  type WebProviderEnv
} from "../../providers/web/providers.js";
import { buildWebSearchBookingSourceProvider } from "./WebSearchBookingSourceProvider.js";
import type { BookingSourceProvider } from "./BookingSourceProvider.js";

type FetchLike = typeof fetch;

export function buildFirecrawlBookingSourceProvider(
  env: WebProviderEnv = process.env,
  fetchImpl: FetchLike = fetch
): BookingSourceProvider {
  const providerName = "firecrawl_booking";
  if (env.ENABLE_FIRECRAWL_CONSOLIDATION !== "true" || !env.FIRECRAWL_API_KEY) {
    return {
      providerName,
      async search() {
        return {
          sourceProvider: providerName,
          searchedQueries: [],
          targets: [],
          warnings: ["Firecrawl booking provider is disabled. Set ENABLE_FIRECRAWL_CONSOLIDATION=true with FIRECRAWL_API_KEY to enable official page extraction."],
          metadata: { enabled: false }
        };
      }
    };
  }

  const provider = buildWebSearchBookingSourceProvider({
    webSearchProvider: new FirecrawlSearchProvider(env, fetchImpl),
    webExtractProvider: new FirecrawlExtractProvider(env, fetchImpl),
    maxQueries: 4,
    maxResultsPerQuery: 4,
    maxExtractPages: 3
  });

  return {
    providerName,
    async search(context) {
      const result = await provider.search(context);
      return {
        ...result,
        sourceProvider: providerName,
        metadata: {
          ...result.metadata,
          enabled: true,
          composedProvider: result.sourceProvider
        }
      };
    }
  };
}
