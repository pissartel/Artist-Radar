import { debugLog } from "../utils/logger.js";

export interface YouTubeChannelIdentifier {
  type: "handle" | "channel" | "custom" | "user";
  value: string;
}

export interface YouTubeChannelStats {
  youtubeChannelId: string;
  youtubeTitle: string;
  youtubeHandle: string | null;
  youtubeSubscribers: number | null;
  youtubeTotalViews: number | null;
  youtubeVideoCount: number | null;
  youtubeUrl: string;
}

interface YouTubeEnv {
  MOCK_AI?: string;
  DEBUG_YOUTUBE?: string;
  YOUTUBE_API_KEY?: string;
}

interface YouTubeChannelsResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      customUrl?: string;
    };
    statistics?: {
      subscriberCount?: string;
      viewCount?: string;
      videoCount?: string;
      hiddenSubscriberCount?: boolean;
    };
  }>;
}

type FetchLike = typeof fetch;

export function extractYouTubeChannelIdentifier(youtubeUrl: string): YouTubeChannelIdentifier | null {
  try {
    const url = new URL(youtubeUrl);
    const hostname = url.hostname.replace(/^www\./, "");
    if (hostname !== "youtube.com" && hostname !== "m.youtube.com") {
      return null;
    }

    const [first, second] = url.pathname.split("/").filter(Boolean);
    if (!first) {
      return null;
    }

    if (first.startsWith("@")) {
      return { type: "handle", value: first };
    }

    if (first === "channel" && second) {
      return { type: "channel", value: second };
    }

    if (first === "c" && second) {
      return { type: "custom", value: second };
    }

    if (first === "user" && second) {
      return { type: "user", value: second };
    }

    return null;
  } catch {
    return null;
  }
}

export async function getYouTubeChannelStats(
  youtubeUrl: string | null | undefined,
  env: YouTubeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<YouTubeChannelStats | null> {
  debugLog("youtube", "youtubeUrl present", { youtubeUrlPresent: Boolean(youtubeUrl) });
  debugLog("youtube", "YouTube API key present", { youtubeApiKeyPresent: Boolean(env.YOUTUBE_API_KEY) });

  if (!youtubeUrl) {
    debugLog("youtube", "parsed YouTube identifier", { parsedYouTubeIdentifier: null });
    return null;
  }

  const identifier = extractYouTubeChannelIdentifier(youtubeUrl);
  debugLog("youtube", "parsed YouTube identifier", {
    parsedYouTubeIdentifier: identifier ? `${identifier.type}:${identifier.value}` : null
  });
  if (!identifier) {
    return null;
  }

  if (env.MOCK_AI === "true") {
    const stats = {
      youtubeChannelId: "mock-youtube-channel",
      youtubeTitle: "Tuesday Fall",
      youtubeHandle: "@TUESDAYFALL",
      youtubeSubscribers: 2400,
      youtubeTotalViews: 185000,
      youtubeVideoCount: 24,
      youtubeUrl
    };
    debugLog("youtube", "normalized YouTube stats", stats);
    return stats;
  }

  if (!env.YOUTUBE_API_KEY) {
    return null;
  }

  try {
    const params = buildChannelsParams(identifier, env.YOUTUBE_API_KEY);
    const response = await fetchImpl(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`);
    debugLog("youtube", "YouTube API result status", { status: response.status });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as YouTubeChannelsResponse;
    const channel = data.items?.[0];
    if (!channel?.id || !channel.snippet?.title) {
      return null;
    }

    const stats = {
      youtubeChannelId: channel.id,
      youtubeTitle: channel.snippet.title,
      youtubeHandle: normalizeHandle(channel.snippet.customUrl),
      youtubeSubscribers:
        channel.statistics?.hiddenSubscriberCount === true ? null : parseNullableInt(channel.statistics?.subscriberCount),
      youtubeTotalViews: parseNullableInt(channel.statistics?.viewCount),
      youtubeVideoCount: parseNullableInt(channel.statistics?.videoCount),
      youtubeUrl
    };
    debugLog("youtube", "normalized YouTube stats", stats);
    return stats;
  } catch (error) {
    debugLog("youtube", "YouTube API result status", {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function buildChannelsParams(identifier: YouTubeChannelIdentifier, apiKey: string): URLSearchParams {
  const params = new URLSearchParams({
    part: "snippet,statistics",
    key: apiKey
  });

  if (identifier.type === "channel") {
    params.set("id", identifier.value);
  } else if (identifier.type === "user") {
    params.set("forUsername", identifier.value);
  } else {
    params.set("forHandle", identifier.value.startsWith("@") ? identifier.value : `@${identifier.value}`);
  }

  return params;
}

function normalizeHandle(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.startsWith("@") ? value : `@${value}`;
}

function parseNullableInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
