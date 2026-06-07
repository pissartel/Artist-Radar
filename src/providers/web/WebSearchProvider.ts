export interface WebSearchOptions {
  limit?: number;
  timeoutMs?: number;
}

export interface WebSearchResult {
  title: string | null;
  url: string | null;
  snippet: string | null;
  sourceProvider: string;
  confidence: number;
  markdown?: string | null;
  links?: string[];
}

export interface WebSearchProvider {
  providerName: string;
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]>;
}
