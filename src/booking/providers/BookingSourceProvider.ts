import type { BookingSearchInput, BookingTarget } from "../types.js";
import {
  buildDefaultWebExtractProvider,
  getEnabledSearchProviders,
  type WebProviderEnv
} from "../../providers/web/providers.js";
import { buildFirecrawlBookingSourceProvider } from "./FirecrawlBookingSourceProvider.js";
import { buildMockBookingSourceProvider } from "./MockBookingSourceProvider.js";
import { buildOpenAgendaBookingSourceProvider, type OpenAgendaBookingSourceProviderEnv } from "./OpenAgendaBookingSourceProvider.js";
import { buildWebSearchBookingSourceProvider } from "./WebSearchBookingSourceProvider.js";

export interface BookingSourceProviderContext {
  input: BookingSearchInput;
  maxResults?: number;
}

export interface BookingSourceProviderResult {
  targets: BookingTarget[];
  sourceProvider: string;
  searchedQueries: string[];
  warnings: string[];
  metadata: Record<string, unknown>;
}

export interface BookingSourceProvider {
  providerName: string;
  search(context: BookingSourceProviderContext): Promise<BookingSourceProviderResult>;
}

export interface DefaultBookingProviderEnv extends WebProviderEnv, OpenAgendaBookingSourceProviderEnv {
  MOCK_AI?: string;
}

type FetchLike = typeof fetch;

export function buildDefaultBookingSourceProviders(
  env: DefaultBookingProviderEnv = process.env,
  fetchImpl: FetchLike = fetch
): BookingSourceProvider[] {
  const providers: BookingSourceProvider[] = [
    buildOpenAgendaBookingSourceProvider({ env, fetchImpl }),
    buildFirecrawlBookingSourceProvider(env, fetchImpl)
  ];
  const webSearchProviders = getEnabledSearchProviders(env, fetchImpl)
    .filter((provider) => provider.providerName !== "firecrawl");
  const webExtractProvider = buildDefaultWebExtractProvider(env, fetchImpl);

  for (const webSearchProvider of webSearchProviders) {
    providers.push(buildWebSearchBookingSourceProvider({
      webSearchProvider,
      webExtractProvider,
      maxQueries: 4,
      maxResultsPerQuery: 4,
      maxExtractPages: 2
    }));
  }

  if (env.MOCK_AI === "true") {
    providers.push(buildMockBookingSourceProvider());
  }

  return providers;
}

export function buildNoopBookingSourceProvider(): BookingSourceProvider {
  return {
    providerName: "noop_booking_source",
    async search() {
      return {
        targets: [],
        sourceProvider: "noop_booking_source",
        searchedQueries: [],
        warnings: ["No booking source provider is enabled."],
        metadata: { enabled: false }
      };
    }
  };
}
