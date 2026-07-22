import type { BookingSearchInput, BookingTarget } from "../types.js";
import {
  buildDefaultWebExtractProvider,
  FirecrawlExtractProvider,
  FirecrawlSearchProvider,
  getEnabledBookingSearchProviders,
  type WebProviderEnv
} from "../../providers/web/providers.js";
import { buildFirecrawlBookingSourceProvider, isFirecrawlBookingEnabled, type FirecrawlBookingEnv } from "./FirecrawlBookingSourceProvider.js";
import { buildMockBookingSourceProvider } from "./MockBookingSourceProvider.js";
import { buildOpenAgendaBookingSourceProvider, type OpenAgendaBookingSourceProviderEnv } from "./OpenAgendaBookingSourceProvider.js";
import {
  buildSceneAgendaBookingSourceProvider,
  getSceneAgendaProviderStatus,
  getSceneAgendaSourceStatuses,
  type SceneAgendaProviderEnv
} from "./SceneAgendaProvider.js";
import {
  buildNativeFetchSceneAgendaProvider,
  getNativeFetchSceneAgendaStatus,
  type NativeFetchSceneAgendaEnv
} from "./NativeFetchSceneAgendaProvider.js";
import { buildSimilarArtistLiveHistoryBookingSourceProvider } from "./SimilarArtistLiveHistoryBookingSourceProvider.js";
import { buildVenueDiscoveryBookingSourceProvider } from "./VenueDiscoveryBookingSourceProvider.js";
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

export interface DefaultBookingProviderEnv extends WebProviderEnv, OpenAgendaBookingSourceProviderEnv, SceneAgendaProviderEnv, NativeFetchSceneAgendaEnv, FirecrawlBookingEnv {
  MOCK_AI?: string;
}

type FetchLike = typeof fetch;

export function buildDefaultBookingSourceProviders(
  env: DefaultBookingProviderEnv = process.env,
  fetchImpl: FetchLike = fetch
): BookingSourceProvider[] {
  logBookingProviderStartup(env);

  const providers: BookingSourceProvider[] = [];
  const webSearchProviders = getEnabledBookingSearchProviders(env, fetchImpl);
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

    // Dedicated venue/organization discovery, independent of any announced
    // event (issue #168): SMACs, bars, clubs, associations, collectives and
    // promoters are searched directly rather than inferred from event pages.
    providers.push(buildVenueDiscoveryBookingSourceProvider({
      webSearchProvider: similarArtistSearchProvider,
      webExtractProvider: similarArtistExtractProvider,
      maxOrganizationQueries: 10,
      maxSimilarArtistVenueQueries: 6,
      maxResultsPerQuery: 4,
      maxExtractPages: 6
    }));
  }

  if (similarArtistSearchProvider && getSceneAgendaProviderStatus(env).enabled) {
    providers.push(buildSceneAgendaBookingSourceProvider({
      env,
      webSearchProvider: similarArtistSearchProvider,
      maxQueries: 8,
      maxResultsPerQuery: 4
    }));
  }

  // Native fetch scene agendas run regardless of web search provider availability
  if (getSceneAgendaProviderStatus(env).enabled) {
    providers.push(buildNativeFetchSceneAgendaProvider({ env, fetchImpl }));
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
  const sceneAgendas = getSceneAgendaProviderStatus(env);
  const sceneSources = getSceneAgendaSourceStatuses(env);
  const nativeFetch = getNativeFetchSceneAgendaStatus(env);
  const tavily = getTavilyBookingStatus(env);
  const exa = getExaBookingStatus(env);
  const jina = getJinaReaderStatus(env);
  const openAgenda = getOpenAgendaProviderStatus(env);
  const firecrawl = getFirecrawlProviderStatus(env);
  const mock = getMockProviderStatus(env);
  warnLog("booking", [
    "Booking providers:",
    `- SceneAgendas: ${sceneAgendas.enabled ? "enabled" : "disabled"} (${sceneAgendas.reason})`,
    ...sceneSources.map((status) => `- ${status.label}: ${status.enabled ? "enabled" : "disabled"} (${status.reason})`),
    `- NativeFetchAgendas: ${nativeFetch.enabled ? "enabled" : "disabled"} (${nativeFetch.reason})`,
    `- Tavily: ${tavily.enabled ? "enabled" : "disabled"} (${tavily.reason})`,
    `- Exa: ${exa.enabled ? "enabled" : "disabled"} (${exa.reason})`,
    `- JinaReader: ${jina.enabled ? "enabled" : "disabled"} (${jina.reason})`,
    `- OpenAgenda: ${openAgenda.enabled ? "enabled" : "disabled"} (${openAgenda.reason})`,
    `- Firecrawl: ${firecrawl.enabled ? "enabled" : "disabled"} (${firecrawl.reason})`,
    `- Mock: ${mock.enabled ? "enabled" : "disabled"} (${mock.reason})`
  ].join("\n"));
}

function getTavilyBookingStatus(env: DefaultBookingProviderEnv): { enabled: boolean; reason: string } {
  if (env.ENABLE_TAVILY_BOOKING === "false") {
    return { enabled: false, reason: "ENABLE_TAVILY_BOOKING is false" };
  }
  if (!env.TAVILY_API_KEY) {
    return { enabled: false, reason: "TAVILY_API_KEY is missing" };
  }
  return { enabled: true, reason: "enabled (TAVILY_API_KEY present)" };
}

function getExaBookingStatus(env: DefaultBookingProviderEnv): { enabled: boolean; reason: string } {
  if (env.ENABLE_EXA_BOOKING === "false") {
    return { enabled: false, reason: "ENABLE_EXA_BOOKING is false" };
  }
  if (!env.EXA_API_KEY) {
    return { enabled: false, reason: "EXA_API_KEY is missing" };
  }
  return { enabled: true, reason: "enabled (EXA_API_KEY present)" };
}

function getJinaReaderStatus(env: DefaultBookingProviderEnv): { enabled: boolean; reason: string } {
  if (env.ENABLE_JINA_READER === "false") {
    return { enabled: false, reason: "ENABLE_JINA_READER is false" };
  }
  if (env.JINA_API_KEY) {
    return { enabled: true, reason: "enabled (JINA_API_KEY present)" };
  }
  return { enabled: true, reason: "enabled (no key required for basic use)" };
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
  if (!isFirecrawlBookingEnabled(env)) {
    if (env.ENABLE_FIRECRAWL_BOOKING === "false") {
      return { enabled: false, reason: "ENABLE_FIRECRAWL_BOOKING is false" };
    }
    if (!env.FIRECRAWL_API_KEY) {
      return { enabled: false, reason: "FIRECRAWL_API_KEY is missing" };
    }
    return { enabled: false, reason: "ENABLE_FIRECRAWL_BOOKING and ENABLE_FIRECRAWL_CONSOLIDATION are both not set" };
  }
  if (env.ENABLE_FIRECRAWL_BOOKING === "true") {
    return { enabled: true, reason: "enabled by ENABLE_FIRECRAWL_BOOKING" };
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
