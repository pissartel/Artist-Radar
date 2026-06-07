export interface WebExtractOptions {
  timeoutMs?: number;
}

export interface WebExtractResult {
  url: string;
  title: string | null;
  text: string | null;
  markdown: string | null;
  sourceProvider: string;
  statusCode: number | null;
}

export interface WebExtractProvider {
  providerName: string;
  extract(url: string, options?: WebExtractOptions): Promise<WebExtractResult | null>;
}
