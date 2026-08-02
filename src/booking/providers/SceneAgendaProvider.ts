import type { WebSearchProvider, WebSearchResult } from "../../providers/web/WebSearchProvider.js";
import { warnLog } from "../../utils/logger.js";
import { extractEventDate } from "../dateParsing.js";
import { matchBookingGenres } from "../genreMatching.js";
import { normalizeSceneAgendaEvent, type RawSceneAgendaEvent } from "../normalization/normalizeSceneAgendaEvent.js";
import {
  compareArtistPopularity,
  filterBookingTargetsForRelevance,
  isStrongSimilarArtistForBooking,
  type BookingRelevanceEnv
} from "../relevance.js";
import type { BookingSearchInput, BookingTarget, DerivedFromSimilarArtist } from "../types.js";
import type { BookingSourceProvider } from "./BookingSourceProvider.js";

export interface SceneAgendaProviderEnv extends BookingRelevanceEnv {
  ENABLE_SCENE_AGENDAS?: string;
  ENABLE_CONCERTS_PUNK?: string;
  ENABLE_PUNKNROLL_AGENDA?: string;
  ENABLE_RAZIBUS?: string;
  ENABLE_FRANCE_PUNK_SCENE?: string;
  ENABLE_CONCERTS_METAL?: string;
}

export interface SceneAgendaSourceStatus {
  key: string;
  label: string;
  enabled: boolean;
  reason: string;
}

export interface SceneAgendaBookingSourceProviderOptions {
  env?: SceneAgendaProviderEnv;
  webSearchProvider: WebSearchProvider;
  maxQueries?: number;
  maxResultsPerQuery?: number;
  now?: Date;
}

interface SceneAgendaSource {
  key: string;
  label: string;
  envKey: keyof SceneAgendaProviderEnv;
  defaultEnabled: boolean;
  queryNames: string[];
  protectedByDefault?: boolean;
}

const SCENE_SOURCES: SceneAgendaSource[] = [
  {
    key: "concerts_punk",
    label: "ConcertsPunk",
    envKey: "ENABLE_CONCERTS_PUNK",
    defaultEnabled: true,
    queryNames: ["ConcertsPunk.fr", "ConcertsPunk"]
  },
  {
    key: "punknroll_agenda",
    label: "PunknRollAgenda",
    envKey: "ENABLE_PUNKNROLL_AGENDA",
    defaultEnabled: true,
    queryNames: ["Punk'n Roll Agenda", "Punk n Roll Agenda"]
  },
  {
    key: "razibus",
    label: "Razibus",
    envKey: "ENABLE_RAZIBUS",
    defaultEnabled: true,
    queryNames: ["Razibus"]
  },
  {
    key: "france_punk_scene",
    label: "FrancePunkScene",
    envKey: "ENABLE_FRANCE_PUNK_SCENE",
    defaultEnabled: true,
    queryNames: ["France Punk Scene"]
  },
  {
    key: "concerts_metal",
    label: "ConcertsMetal",
    envKey: "ENABLE_CONCERTS_METAL",
    defaultEnabled: false,
    queryNames: ["Concerts-metal.com", "Concerts Metal"],
    protectedByDefault: true
  }
];

const BLOCKED_ACCESS_PATTERN = /\b(check_bot|captcha|robot|robots\.txt|cloudflare|access denied|bot protection|anti-bot|forbidden)\b/i;
const SUPPORT_SLOT_PATTERN = /\b(\+ guest|support tba|première partie à venir|premiere partie a venir|line-?up soon|guests tba)\b/i;

export function buildSceneAgendaBookingSourceProvider(options: SceneAgendaBookingSourceProviderOptions): BookingSourceProvider {
  const env = options.env ?? process.env;
  return {
    providerName: `scene_agendas:${options.webSearchProvider.providerName}`,
    async search({ input, maxResults }) {
      const sceneStatus = getSceneAgendaProviderStatus(env);
      if (!sceneStatus.enabled) {
        return {
          targets: [],
          sourceProvider: `scene_agendas:${options.webSearchProvider.providerName}`,
          searchedQueries: [],
          warnings: [`Scene agenda providers are disabled: ${sceneStatus.reason}.`],
          metadata: { enabled: false, reason: sceneStatus.reason, sourceStatuses: getSceneAgendaSourceStatuses(env) }
        };
      }

      const sourceStatuses = getSceneAgendaSourceStatuses(env);
      const enabledSources = sourceStatuses
        .filter((status) => status.enabled)
        .flatMap((status) => SCENE_SOURCES.filter((source) => source.key === status.key));
      const disabledProtected = sourceStatuses
        .filter((status) => !status.enabled && status.key === "concerts_metal")
        .map((status) => `${status.label} disabled: ${status.reason}.`);
      const queries = buildSceneAgendaQueries(input, enabledSources)
        .slice(0, options.maxQueries ?? Math.max(4, enabledSources.length * 2));
      const warnings = [...disabledProtected];
      const rawEvents: RawSceneAgendaEvent[] = [];
      let blockedResults = 0;

      for (const query of queries) {
        const source = query.source;
        const results = await options.webSearchProvider.search(query.query, {
          limit: Math.min(options.maxResultsPerQuery ?? 4, maxResults ?? input.limit)
        });
        for (const result of results) {
          if (isBlockedOrProtected(result)) {
            blockedResults += 1;
            warnings.push(`${source.label} returned a blocked/protected result and was skipped.`);
            continue;
          }
          rawEvents.push(searchResultToSceneEvent(input, source, result));
        }
      }

      const normalizedTargets = rawEvents.flatMap((event) => {
        const target = normalizeSceneAgendaEvent(input, event);
        return target ? [attachSimilarArtistContext(input, target)] : [];
      });
      const filtered = filterBookingTargetsForRelevance(input, normalizedTargets, env, options.now ?? new Date());
      const possibleSupportSlots = filtered.targets.filter((target) => SUPPORT_SLOT_PATTERN.test([
        target.description,
        ...target.evidence
      ].filter(Boolean).join(" "))).length;

      logSceneAgendaSummary({
        providersQueried: enabledSources.length,
        rawEventsFound: rawEvents.length,
        futureEventsKept: filtered.targets.filter((target) => target.isFutureEvent === true).length,
        recentVenueHistoryEventsKept: filtered.targets.filter((target) => target.isFutureEvent === false).length,
        rejectedOldEvents: filtered.summary.rejectedOldEvents,
        rejectedGenreMismatch: filtered.summary.rejectedGenreMismatchEvents,
        possibleSupportSlots
      });

      return {
        targets: filtered.targets,
        sourceProvider: `scene_agendas:${options.webSearchProvider.providerName}`,
        searchedQueries: queries.map((query) => query.query),
        warnings: uniqueStrings([...warnings, ...filtered.summary.warnings]),
        metadata: {
          enabled: true,
          searchProvider: options.webSearchProvider.providerName,
          sourceStatuses,
          providersQueried: enabledSources.map((source) => source.key),
          rawEventsFound: rawEvents.length,
          blockedResults,
          keptTargets: filtered.targets.length,
          possibleSupportSlots
        }
      };
    }
  };
}

export function getSceneAgendaProviderStatus(env: SceneAgendaProviderEnv = process.env): { enabled: boolean; reason: string } {
  if (env.ENABLE_SCENE_AGENDAS === "false") {
    return { enabled: false, reason: "ENABLE_SCENE_AGENDAS is explicitly false" };
  }
  if (env.ENABLE_SCENE_AGENDAS === "true") {
    return { enabled: true, reason: "enabled by ENABLE_SCENE_AGENDAS" };
  }
  return { enabled: true, reason: "enabled by default" };
}

export function getSceneAgendaSourceStatuses(env: SceneAgendaProviderEnv = process.env): SceneAgendaSourceStatus[] {
  const sceneEnabled = getSceneAgendaProviderStatus(env).enabled;
  return SCENE_SOURCES.map((source) => {
    if (!sceneEnabled) {
      return { key: source.key, label: source.label, enabled: false, reason: "ENABLE_SCENE_AGENDAS is not true" };
    }
    const configured = env[source.envKey];
    if (source.protectedByDefault && configured !== "true") {
      return { key: source.key, label: source.label, enabled: false, reason: "disabled by default because automated access may hit bot protection/check_bot" };
    }
    if (configured === "false") {
      return { key: source.key, label: source.label, enabled: false, reason: `${source.envKey} is false` };
    }
    if (configured === "true" || source.defaultEnabled) {
      return { key: source.key, label: source.label, enabled: true, reason: configured === "true" ? `enabled by ${source.envKey}` : "enabled by scene agenda defaults" };
    }
    return { key: source.key, label: source.label, enabled: false, reason: `${source.envKey} is not true` };
  });
}

function buildSceneAgendaQueries(input: BookingSearchInput, sources: SceneAgendaSource[]): Array<{ source: SceneAgendaSource; query: string }> {
  const location = input.target || input.city || input.artistProfile?.city || "France";
  const genreKeywords = buildSceneGenreKeywords(input.genre);
  return sources.flatMap((source) => source.queryNames.slice(0, 2).map((name) => ({
    source,
    query: `"${name}" "${location}" ${genreKeywords.slice(0, 4).map((keyword) => `"${keyword}"`).join(" ")} concert festival support`
  })));
}

function buildSceneGenreKeywords(genre: string): string[] {
  const normalized = genre.toLowerCase();
  if (normalized.includes("pop punk")) {
    return ["pop punk", "punk rock", "emo", "easycore", "skate punk", "hardcore punk"];
  }
  if (normalized.includes("metal")) {
    return ["metal", "metalcore", "hardcore", "concert", "festival"];
  }
  if (normalized.includes("hardcore")) {
    return ["hardcore", "hardcore punk", "punk", "metalcore", "concert"];
  }
  if (normalized.includes("alternative") || normalized.includes("indie")) {
    return ["alternative rock", "indie rock", "post-punk", "punk", "concert"];
  }
  return [genre, "concert", "festival", "musiques actuelles"];
}

function searchResultToSceneEvent(
  input: BookingSearchInput,
  source: SceneAgendaSource,
  result: WebSearchResult
): RawSceneAgendaEvent {
  const text = [result.title, result.snippet, result.markdown, result.url, ...(result.links ?? [])].filter(Boolean).join(" ");
  return {
    title: result.title ?? result.url ?? `${source.label} event`,
    sourceUrl: result.url,
    providerName: source.key,
    city: input.city || input.artistProfile?.city || null,
    country: input.artistProfile?.country ?? "France",
    description: result.snippet ?? result.markdown ?? null,
    eventDate: extractEventDate(text),
    lineupArtists: detectLineupArtists(input, text),
    venueName: detectVenueName(text),
    genresDetected: buildDetectedGenres(text),
    confidenceScore: result.confidence
  };
}

export function attachSimilarArtistContext(input: BookingSearchInput, target: BookingTarget): BookingTarget {
  const text = [target.name, target.description, ...target.evidence, ...(target.pastProgramming ?? [])].filter(Boolean).join(" ").toLowerCase();
  const similarArtist = (input.similarArtists ?? [])
    .filter((artist) => isStrongSimilarArtistForBooking(input, artist))
    .find((artist) => text.includes(artist.name.toLowerCase()));
  if (!similarArtist) return target;

  const popularity = compareArtistPopularity(input, similarArtist);
  const genreMatch = matchBookingGenres([input.genre], similarArtist.genres, similarArtist.reason);
  const derived: DerivedFromSimilarArtist = {
    name: similarArtist.name,
    popularityComparison: popularity.comparison,
    matchedGenres: genreMatch.matchedGenres,
    sourceUrl: target.sourceUrl
  };

  return {
    ...target,
    confidence: Math.min(1, target.confidence + 0.08),
    derivedFromSimilarArtist: derived,
    evidence: [
      ...target.evidence,
      `Similar artist ${similarArtist.name} appears in this scene agenda source.`,
      popularity.reason
    ]
  };
}

function isBlockedOrProtected(result: WebSearchResult): boolean {
  return BLOCKED_ACCESS_PATTERN.test([
    result.title,
    result.url,
    result.snippet,
    result.markdown
  ].filter(Boolean).join(" "));
}

function detectLineupArtists(input: BookingSearchInput, text: string): string[] {
  const normalized = text.toLowerCase();
  return uniqueStrings((input.similarArtists ?? [])
    .map((artist) => artist.name)
    .filter((name) => normalized.includes(name.toLowerCase())));
}

function detectVenueName(text: string): string | null {
  const match = text.match(/\b(?:at|à|au|venue|salle)\s+([A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ' -]{2,60})/);
  return match?.[1]?.trim() ?? null;
}

function buildDetectedGenres(text: string): string[] {
  const known = [
    "pop punk",
    "punk rock",
    "hardcore punk",
    "emo pop",
    "melodic punk",
    "skate punk",
    "easycore",
    "metalcore",
    "alternative rock",
    "post-punk",
    "punk",
    "emo",
    "hardcore",
    "metal",
    "rock"
  ];
  const normalized = text.toLowerCase();
  return known.filter((genre) => new RegExp(`\\b${escapeRegExp(genre)}\\b`).test(normalized));
}

function logSceneAgendaSummary(summary: {
  providersQueried: number;
  rawEventsFound: number;
  futureEventsKept: number;
  recentVenueHistoryEventsKept: number;
  rejectedOldEvents: number;
  rejectedGenreMismatch: number;
  possibleSupportSlots: number;
}): void {
  warnLog("booking", [
    "Scene agenda filters:",
    `- providers queried: ${summary.providersQueried}`,
    `- raw events found: ${summary.rawEventsFound}`,
    `- future events kept: ${summary.futureEventsKept}`,
    `- recent venue-history events kept: ${summary.recentVenueHistoryEventsKept}`,
    `- rejected old events: ${summary.rejectedOldEvents}`,
    `- rejected genre mismatch: ${summary.rejectedGenreMismatch}`,
    `- possible support-slot candidates: ${summary.possibleSupportSlots}`
  ].join("\n"));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
