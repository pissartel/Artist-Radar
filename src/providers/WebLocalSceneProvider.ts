import type { ArtistTier } from "../schemas.js";
import type { InstagramHandleExtraction } from "../modules/instagramHandleExtractor.js";

export type WebLocalSceneSourceType =
  | "venue"
  | "event_page"
  | "blog"
  | "local_agenda"
  | "collective"
  | "association"
  | "search_result";

export interface WebLocalSceneProviderInput {
  city: string;
  genre: string;
  target?: string | null;
  limit?: number;
}

export interface WebLocalSceneSourcePage {
  url: string;
  title: string | null;
  sourceType: WebLocalSceneSourceType;
  snippet: string | null;
}

export interface WebLocalSceneArtistDiscovery {
  artistName: string;
  city: string | null;
  genres: string[];
  eventName: string | null;
  venueName: string | null;
  sourceUrl: string;
  sourceType: WebLocalSceneSourceType;
  instagramLinks: InstagramHandleExtraction[];
  estimatedTier: ArtistTier | null;
  confidence: number;
  reason: string;
}

export interface WebLocalSceneProviderResult {
  sourcePages: WebLocalSceneSourcePage[];
  artists: WebLocalSceneArtistDiscovery[];
}

export interface WebLocalSceneProvider {
  name: "web_local_scene";
  search(input: WebLocalSceneProviderInput): Promise<WebLocalSceneProviderResult>;
}

export function buildWebLocalSceneProvider(): WebLocalSceneProvider {
  return {
    name: "web_local_scene",
    async search() {
      return {
        sourcePages: [],
        artists: []
      };
    }
  };
}
