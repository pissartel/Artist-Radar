import type { BookingSearchInput, BookingTarget } from "../types.js";
import {
  buildDefaultWebExtractProvider,
  FirecrawlExtractProvider,
  FirecrawlSearchProvider,
  getEnabledSearchProviders,
  type WebProviderEnv
} from "../../providers/web/providers.js";
import { buildFirecrawlBookingSourceProvider } from "./FirecrawlBookingSourceProvider.js";
import { buildMockBookingSourceProvider } from "./MockBookingSourceProvider.js";
import { buildOpenAgendaBookingSourceProvider, type OpenAgendaBookingSourceProviderEnv } from "./OpenAgendaBookingSourceProvider.js";
import { buildSimilarArtistLiveHistoryBookingSourceProvider } from "./SimilarArtistLiveHistoryBookingSourceProvider.js";
import { buildWebSearchBookingSourceProvider } from "./WebSearchBookingSourceProvider.js";
import { warnLog } from "../../utils/logger.js";

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
  logBookingProviderStartup(env);

  const providers: BookingSourceProvider[] = [];
  const webSearchProviders = getEnabledSearchProviders(env, fetchImpl)
    .filter((provider) => provider.providerName !== "firecrawl");
  const webExtractProvider = buildDefaultWebExtractProvider(env, fetchImpl);

  const similarArtistSearchProvider = env.ENABLE_FIRECRAWL_CONSOLIDATION === "true" && env.FIRECRAWL_API_KEY
    ? new FirecrawlSearchProvider(env, fetchImpl)
    : webSearchProviders[0] ?? null;
  const similarArtistExtractProvider = env.ENABLE_FIRECRAWL_CONSOLIDATION === "true" && env.FIRECRAWL_API_KEY
    ? new FirecrawlExtractProvider(env, fetchImpl)
    : webExtractProvider;

  if (similarArtistSearchProvider) {
    providers.push(buildSimilarArtistLiveHistoryBookingSourceProvider({
      webSearchProvider: similarArtistSearchProvider,
      webExtractProvider: similarArtistExtractProvider,
      maxSimilarArtists: 6,
      maxResultsPerArtist: 3,
      maxExtractPages: 6
    }));
  }

  providers.push(
    buildOpenAgendaBookingSourceProvider({ env, fetchImpl }),
    buildFirecrawlBookingSourceProvider(env, fetchImpl)
  );

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

function logBookingProviderStartup(env: DefaultBookingProviderEnv): void {
  const openAgenda = getOpenAgendaProviderStatus(env);
  const firecrawl = getFirecrawlProviderStatus(env);
  const mock = getMockProviderStatus(env);
  warnLog("booking", [
    "Booking providers:",
    `- OpenAgenda: ${openAgenda.enabled ? "enabled" : "disabled"} (${openAgenda.reason})`,
    `- Firecrawl: ${firecrawl.enabled ? "enabled" : "disabled"} (${firecrawl.reason})`,
    `- Mock: ${mock.enabled ? "enabled" : "disabled"} (${mock.reason})`
  ].join("\n"));
}

function getOpenAgendaProviderStatus(env: DefaultBookingProviderEnv): { enabled: boolean; reason: string } {
  if (env.ENABLE_OPENAGENDA !== "true" && env.ENABLE_OPENAGENDA_BOOKING !== "true") {
    return { enabled: false, reason: "ENABLE_OPENAGENDA is not true" };
  }
  if (!env.OPENAGENDA_API_KEY) {
    return { enabled: false, reason: "OPENAGENDA_API_KEY is missing" };
  }
  if (env.OPENAGENDA_AGENDA_UIDS || env.OPENAGENDA_AGENDA_UID) {
    return { enabled: true, reason: "enabled with configured OpenAgenda agenda UIDs" };
  }
  return { enabled: true, reason: "enabled with OpenAgenda agenda discovery" };
}

function getFirecrawlProviderStatus(env: DefaultBookingProviderEnv): { enabled: boolean; reason: string } {
  if (env.ENABLE_FIRECRAWL_CONSOLIDATION !== "true") {
    return { enabled: false, reason: "ENABLE_FIRECRAWL_CONSOLIDATION is not true" };
  }
  if (!env.FIRECRAWL_API_KEY) {
    return { enabled: false, reason: "FIRECRAWL_API_KEY is missing" };
  }
  return { enabled: true, reason: "enabled by ENABLE_FIRECRAWL_CONSOLIDATION" };
}

function getMockProviderStatus(env: DefaultBookingProviderEnv): { enabled: boolean; reason: string } {
  if (env.MOCK_AI === "true") {
    return { enabled: true, reason: "enabled by MOCK_AI" };
  }
  return { enabled: false, reason: "MOCK_AI is not true" };
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
