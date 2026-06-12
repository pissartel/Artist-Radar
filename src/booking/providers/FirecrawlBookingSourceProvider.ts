import {
  FirecrawlExtractProvider,
  FirecrawlSearchProvider,
  type WebProviderEnv
} from "../../providers/web/providers.js";
import { buildWebSearchBookingSourceProvider } from "./WebSearchBookingSourceProvider.js";
import type { BookingSourceProvider } from "./BookingSourceProvider.js";
import { warnLog } from "../../utils/logger.js";

type FetchLike = typeof fetch;

const FIRECRAWL_QUOTA_STATUSES = new Set([402, 429, 503]);
const FIRECRAWL_QUOTA_BODY_PATTERN = /\b(quota|credits?|payment required|rate limit|upgrade|billing|no credits?|insufficient credits?)\b/i;

export interface FirecrawlBookingEnv extends WebProviderEnv {
  ENABLE_FIRECRAWL_BOOKING?: string;
}

export function buildFirecrawlBookingSourceProvider(
  env: FirecrawlBookingEnv = process.env,
  fetchImpl: FetchLike = fetch
): BookingSourceProvider {
  const providerName = "firecrawl_booking";

  if (!isFirecrawlBookingEnabled(env)) {
    const reason = getFirecrawlBookingDisabledReason(env);
    return {
      providerName,
      async search() {
        return {
          sourceProvider: providerName,
          searchedQueries: [],
          targets: [],
          warnings: [reason],
          metadata: { enabled: false, disabledReason: reason }
        };
      }
    };
  }

  let quotaWarning: string | null = null;

  const quotaAwareFetch: FetchLike = async (input, init) => {
    const response = await fetchImpl(input, init);
    if (!quotaWarning && FIRECRAWL_QUOTA_STATUSES.has(response.status)) {
      const bodyText = await response.clone().text().catch(() => "");
      if (FIRECRAWL_QUOTA_BODY_PATTERN.test(bodyText) || response.status === 402) {
        quotaWarning = `Firecrawl disabled for this run: quota or credits unavailable (HTTP ${response.status}).`;
        warnLog("booking", quotaWarning);
      }
    }
    return response;
  };

  const provider = buildWebSearchBookingSourceProvider({
    webSearchProvider: new FirecrawlSearchProvider(env, quotaAwareFetch),
    webExtractProvider: new FirecrawlExtractProvider(env, quotaAwareFetch),
    maxQueries: 4,
    maxResultsPerQuery: 4,
    maxExtractPages: 3
  });

  return {
    providerName,
    async search(context) {
      if (quotaWarning) {
        return {
          sourceProvider: providerName,
          searchedQueries: [],
          targets: [],
          warnings: [quotaWarning],
          metadata: { enabled: false, disabledReason: quotaWarning }
        };
      }

      const result = await provider.search(context);

      if (quotaWarning) {
        return {
          ...result,
          targets: [],
          warnings: [quotaWarning, ...result.warnings],
          metadata: { ...result.metadata, enabled: false, disabledReason: quotaWarning }
        };
      }

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

export function isFirecrawlBookingEnabled(env: FirecrawlBookingEnv): boolean {
  if (env.ENABLE_FIRECRAWL_BOOKING === "false") return false;
  if (env.ENABLE_FIRECRAWL_BOOKING === "true") return Boolean(env.FIRECRAWL_API_KEY);
  if (env.ENABLE_FIRECRAWL_CONSOLIDATION === "true") return Boolean(env.FIRECRAWL_API_KEY);
  return false;
}

function getFirecrawlBookingDisabledReason(env: FirecrawlBookingEnv): string {
  if (env.ENABLE_FIRECRAWL_BOOKING === "false") {
    return "Firecrawl booking disabled: ENABLE_FIRECRAWL_BOOKING=false.";
  }
  if (!env.FIRECRAWL_API_KEY) {
    return "Firecrawl booking provider is disabled. Set ENABLE_FIRECRAWL_BOOKING=true with FIRECRAWL_API_KEY to enable official page extraction.";
  }
  return "Firecrawl booking disabled: ENABLE_FIRECRAWL_BOOKING and ENABLE_FIRECRAWL_CONSOLIDATION are both not set.";
}
