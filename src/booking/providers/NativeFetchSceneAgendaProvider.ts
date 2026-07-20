import { warnLog } from "../../utils/logger.js";
import { extractEventDate } from "../dateParsing.js";
import { normalizeSceneAgendaEvent, type RawSceneAgendaEvent } from "../normalization/normalizeSceneAgendaEvent.js";
import { extractPageMetadata } from "../pageMetadata.js";
import { filterBookingTargetsForRelevance } from "../relevance.js";
import { isGenericCtaTitle } from "../titleNormalization.js";
import type { BookingSearchInput } from "../types.js";
import type { BookingSourceProvider } from "./BookingSourceProvider.js";
import { getSceneAgendaProviderStatus, type SceneAgendaProviderEnv, type SceneAgendaSourceStatus } from "./SceneAgendaProvider.js";

export interface NativeFetchSceneAgendaEnv extends SceneAgendaProviderEnv {
  CONCERTS_PUNK_URL?: string;
  RAZIBUS_URL?: string;
  PUNKNROLL_AGENDA_URL?: string;
  FRANCE_PUNK_SCENE_URL?: string;
}

interface NativeFetchSceneSource {
  key: string;
  label: string;
  envUrlKey: keyof NativeFetchSceneAgendaEnv & string;
  envEnableKey: keyof SceneAgendaProviderEnv & string;
  defaultUrl: string | null;
  isPunkScene: boolean;
}

type FetchLike = typeof fetch;

const NATIVE_FETCH_TIMEOUT_MS = 10_000;
// Bounded, best-effort per-entry detail-page fetch to recover a real title,
// description, poster image and announced performers when the listing page
// only exposes a generic CTA link (e.g. "Voir la page de l'évènement" on
// Razibus). Capped to keep search latency predictable; failures never block
// the opportunity (see enrichEntryWithPageMetadata).
const DETAIL_ENRICHMENT_BUDGET = 8;
const DETAIL_FETCH_TIMEOUT_MS = 6_000;

interface PageEnrichment {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  performers: string[];
}

const EMPTY_ENRICHMENT: PageEnrichment = { title: null, description: null, imageUrl: null, performers: [] };

const NATIVE_SCENE_SOURCES: NativeFetchSceneSource[] = [
  {
    key: "concerts_punk",
    label: "ConcertsPunk",
    envUrlKey: "CONCERTS_PUNK_URL",
    envEnableKey: "ENABLE_CONCERTS_PUNK",
    defaultUrl: "https://www.concertspunk.fr/?country=fr",
    isPunkScene: true
  },
  {
    key: "razibus",
    label: "Razibus",
    envUrlKey: "RAZIBUS_URL",
    envEnableKey: "ENABLE_RAZIBUS",
    defaultUrl: "https://razibus.net/evenements-a-venir.php",
    isPunkScene: true
  },
  {
    key: "punknroll_agenda",
    label: "PunknRollAgenda",
    envUrlKey: "PUNKNROLL_AGENDA_URL",
    envEnableKey: "ENABLE_PUNKNROLL_AGENDA",
    defaultUrl: "https://agenda.punknroll.fr/",
    isPunkScene: true
  },
  {
    key: "france_punk_scene",
    label: "FrancePunkScene",
    envUrlKey: "FRANCE_PUNK_SCENE_URL",
    envEnableKey: "ENABLE_FRANCE_PUNK_SCENE",
    defaultUrl: null,
    isPunkScene: true
  }
];

const SUPPORT_SIGNAL_PATTERN = /\b(première partie|premiere partie|1ère partie|1ere partie|support tba|\+\s*guests?|line-?up (bientôt|soon)|guests tba)\b/i;
const BLOCKED_PATTERN = /\b(check_bot|captcha|robot\.txt|cloudflare|access denied|bot protection|anti-bot|forbidden)\b/i;

export interface NativeFetchSceneAgendaProviderOptions {
  env?: NativeFetchSceneAgendaEnv;
  fetchImpl?: FetchLike;
  now?: Date;
}

export function buildNativeFetchSceneAgendaProvider(options: NativeFetchSceneAgendaProviderOptions = {}): BookingSourceProvider {
  const env = options.env ?? (process.env as NativeFetchSceneAgendaEnv);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();

  return {
    providerName: "native_fetch_scene_agendas",
    async search({ input }) {
      const sceneStatus = getSceneAgendaProviderStatus(env);
      if (!sceneStatus.enabled) {
        return {
          targets: [],
          sourceProvider: "native_fetch_scene_agendas",
          searchedQueries: [],
          warnings: [`Native fetch scene agendas disabled: ${sceneStatus.reason}.`],
          metadata: { enabled: false, reason: sceneStatus.reason }
        };
      }

      const sourceStatuses: SceneAgendaSourceStatus[] = buildSourceStatuses(env, input.genre);
      const enabledSources = NATIVE_SCENE_SOURCES.filter((source) => {
        const status = sourceStatuses.find((s) => s.key === source.key);
        return status?.enabled === true;
      });

      const warnings: string[] = [];
      const fetchedUrls: string[] = [];
      const rawEvents: RawSceneAgendaEvent[] = [];
      let detailFetchBudget = DETAIL_ENRICHMENT_BUDGET;

      for (const source of enabledSources) {
        const url = (env[source.envUrlKey as keyof NativeFetchSceneAgendaEnv] as string | undefined) ?? source.defaultUrl;
        if (!url) continue;

        fetchedUrls.push(url);
        try {
          const response = await fetchWithTimeout(url, fetchImpl);
          if (!response.ok) {
            warnings.push(`${source.label} returned HTTP ${response.status}; skipping.`);
            continue;
          }
          const text = await response.text();
          if (BLOCKED_PATTERN.test(text.slice(0, 2000))) {
            warnings.push(`${source.label} returned a blocked/protected page; skipping.`);
            continue;
          }
          const entries = parseResponseEntries(text);
          for (const entry of entries) {
            let enrichment: PageEnrichment = EMPTY_ENRICHMENT;
            if (detailFetchBudget > 0 && entry.url) {
              detailFetchBudget -= 1;
              enrichment = await enrichEntryWithPageMetadata(entry.url, fetchImpl);
            }
            rawEvents.push(buildSceneEvent(input, source, entry, enrichment));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`${source.label} fetch failed: ${message}.`);
        }
      }

      const normalizedTargets = rawEvents.flatMap((event) => {
        const target = normalizeSceneAgendaEvent(input, event);
        return target ? [target] : [];
      });

      const filtered = filterBookingTargetsForRelevance(input, normalizedTargets, env, now);
      const possibleSupportSlots = filtered.targets.filter((target) =>
        SUPPORT_SIGNAL_PATTERN.test([target.description, ...target.evidence].filter(Boolean).join(" "))
      ).length;

      warnLog("booking", [
        "Native fetch scene agendas:",
        `- sources fetched: ${enabledSources.length}`,
        `- raw entries found: ${rawEvents.length}`,
        `- kept targets: ${filtered.targets.length}`,
        `- possible support-slots: ${possibleSupportSlots}`
      ].join("\n"));

      return {
        targets: filtered.targets,
        sourceProvider: "native_fetch_scene_agendas",
        searchedQueries: fetchedUrls,
        warnings: [...warnings, ...filtered.summary.warnings],
        metadata: {
          enabled: true,
          sourceStatuses,
          sourcesFetched: enabledSources.length,
          rawEventsFound: rawEvents.length,
          keptTargets: filtered.targets.length,
          possibleSupportSlots,
          fetchedUrls
        }
      };
    }
  };
}

export function getNativeFetchSceneAgendaStatus(env: NativeFetchSceneAgendaEnv = process.env as NativeFetchSceneAgendaEnv): { enabled: boolean; reason: string } {
  const sceneStatus = getSceneAgendaProviderStatus(env);
  if (!sceneStatus.enabled) return sceneStatus;
  const hasAnyUrl = NATIVE_SCENE_SOURCES.some((source) => {
    if (env[source.envEnableKey as keyof SceneAgendaProviderEnv] === "false") return false;
    const url = (env[source.envUrlKey as keyof NativeFetchSceneAgendaEnv] as string | undefined) ?? source.defaultUrl;
    return Boolean(url);
  });
  if (!hasAnyUrl) return { enabled: false, reason: "no scene agenda fetch URLs are configured" };
  return { enabled: true, reason: sceneStatus.reason };
}

function buildSourceStatuses(env: NativeFetchSceneAgendaEnv, genre: string): SceneAgendaSourceStatus[] {
  const sceneEnabled = getSceneAgendaProviderStatus(env).enabled;
  const isPunk = isPunkCompatibleGenre(genre);
  return NATIVE_SCENE_SOURCES.map((source) => {
    if (!sceneEnabled) {
      return { key: source.key, label: source.label, enabled: false, reason: "ENABLE_SCENE_AGENDAS is disabled" };
    }
    const explicitEnable = env[source.envEnableKey as keyof SceneAgendaProviderEnv];
    if (explicitEnable === "false") {
      return { key: source.key, label: source.label, enabled: false, reason: `${source.envEnableKey} is false` };
    }
    const url = (env[source.envUrlKey as keyof NativeFetchSceneAgendaEnv] as string | undefined) ?? source.defaultUrl;
    if (!url) {
      const noUrlReason = source.key === "france_punk_scene"
        ? `no public event listing URL is configured; set ${source.envUrlKey} to enable`
        : `no URL configured (set ${source.envUrlKey})`;
      return { key: source.key, label: source.label, enabled: false, reason: noUrlReason };
    }
    if (explicitEnable === "true") {
      return { key: source.key, label: source.label, enabled: true, reason: `enabled by ${source.envEnableKey}` };
    }
    if (source.isPunkScene && isPunk) {
      return { key: source.key, label: source.label, enabled: true, reason: `selected by genre: ${genre}` };
    }
    if (source.isPunkScene) {
      return { key: source.key, label: source.label, enabled: false, reason: `not selected for genre: ${genre}` };
    }
    return { key: source.key, label: source.label, enabled: true, reason: "enabled by default" };
  });
}

function isPunkCompatibleGenre(genre: string): boolean {
  const normalized = genre.toLowerCase();
  return (
    normalized.includes("punk") ||
    normalized.includes("emo") ||
    normalized.includes("easycore") ||
    normalized.includes("hardcore")
  );
}

interface ParsedEntry {
  title: string | null;
  url: string | null;
  description: string | null;
  pubDate: string | null;
}

function parseResponseEntries(text: string): ParsedEntry[] {
  if (text.includes("<item>") || text.includes("<item ") || text.includes("<entry>") || text.includes("<entry ")) {
    return parseRssEntries(text);
  }
  return parseHtmlEntries(text);
}

function parseRssEntries(xml: string): ParsedEntry[] {
  const itemPattern = /<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi;
  const items: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(xml)) !== null && items.length < 25) {
    items.push(match[0]);
  }
  return items.map((item) => ({
    title: extractXmlText(item, "title"),
    url: extractXmlText(item, "link") ?? extractXmlAttr(item, "link", "href"),
    description: stripHtmlTags(
      extractXmlText(item, "description") ?? extractXmlText(item, "summary") ?? extractXmlText(item, "content") ?? ""
    ),
    pubDate: extractXmlText(item, "pubDate") ?? extractXmlText(item, "published") ?? extractXmlText(item, "updated")
  }));
}

function extractXmlText(xml: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
  return xml.match(pattern)?.[1]?.trim() ?? null;
}

function extractXmlAttr(xml: string, tag: string, attr: string): string | null {
  const pattern = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"`, "i");
  return xml.match(pattern)?.[1]?.trim() ?? null;
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

function parseHtmlEntries(html: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const linkPattern = /href="(https?:\/\/[^"#]{10,200})"[^>]*>\s*([^<]{5,200})</gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null && entries.length < 15) {
    const title = match[2].trim();
    if (title.length >= 5) {
      entries.push({ title, url: match[1], description: null, pubDate: null });
    }
  }
  return entries;
}

/** Best-effort, bounded fetch of an entry's own page to recover a real title/description/image/lineup. Never throws. */
async function enrichEntryWithPageMetadata(url: string, fetchImpl: FetchLike): Promise<PageEnrichment> {
  try {
    const response = await fetchWithTimeout(url, fetchImpl, DETAIL_FETCH_TIMEOUT_MS);
    if (!response.ok) return EMPTY_ENRICHMENT;
    const html = await response.text();
    if (BLOCKED_PATTERN.test(html.slice(0, 2000))) return EMPTY_ENRICHMENT;
    return extractPageMetadata(html);
  } catch {
    return EMPTY_ENRICHMENT;
  }
}

function buildSceneEvent(
  input: BookingSearchInput,
  source: NativeFetchSceneSource,
  entry: ParsedEntry,
  enrichment: PageEnrichment = EMPTY_ENRICHMENT
): RawSceneAgendaEvent {
  const title = pickBetterTitle(entry.title, enrichment.title, source.label);
  const description = entry.description ?? enrichment.description;
  const text = [title, description, entry.url].filter(Boolean).join(" ");
  return {
    title,
    sourceUrl: entry.url ?? null,
    providerName: source.key,
    city: input.city || null,
    country: input.artistProfile?.country ?? "France",
    description,
    eventDate: parseEntryDate(entry.pubDate) ?? extractEventDate(text),
    lineupArtists: enrichment.performers,
    venueName: null,
    genresDetected: detectGenresFromText(text),
    confidenceScore: 0.6,
    imageUrl: enrichment.imageUrl
  };
}

/** Prefers a non-generic entry title, falling back to the detail page's own title, then a generic label. Both are checked for CTA-style text (see titleNormalization.ts) so a generic page <title> never wins over a usable listing title. */
function pickBetterTitle(entryTitle: string | null, pageTitle: string | null, sourceLabel: string): string {
  const entryIsUsable = Boolean(entryTitle) && !isGenericCtaTitle(entryTitle!);
  if (entryIsUsable) return entryTitle!;
  const pageIsUsable = Boolean(pageTitle) && !isGenericCtaTitle(pageTitle!);
  if (pageIsUsable) return pageTitle!;
  return entryTitle ?? pageTitle ?? `${sourceLabel} event`;
}

function parseEntryDate(pubDate: string | null): string | null {
  if (!pubDate) return null;
  const date = new Date(pubDate);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split("T")[0];
  }
  return extractEventDate(pubDate);
}

function detectGenresFromText(text: string): string[] {
  const known = [
    "pop punk", "punk rock", "hardcore punk", "emo pop", "melodic punk",
    "skate punk", "easycore", "metalcore", "alternative rock", "post-punk",
    "punk", "emo", "hardcore", "metal", "rock"
  ];
  const normalized = text.toLowerCase();
  return known.filter((genre) =>
    new RegExp(`\\b${genre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalized)
  );
}

async function fetchWithTimeout(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number = NATIVE_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ArtistRadar/1.0 (booking search)" }
    });
  } finally {
    clearTimeout(timeout);
  }
}
