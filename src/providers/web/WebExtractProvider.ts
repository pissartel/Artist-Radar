export interface WebExtractOptions {
  timeoutMs?: number;
}

export interface WebExtractResult {
  url: string;
  title: string | null;
  text: string | null;
  markdown: string | null;
  /** Full, unprocessed HTML (head/header/footer/JSON-LD/meta tags intact) when the provider supports it — never the "main content only" cleaned HTML. */
  html?: string | null;
  /** Links found on the page, when the provider supports extracting them (used for bounded event-detail-page discovery, never an unrestricted crawl). */
  links?: string[] | null;
  sourceProvider: string;
  statusCode: number | null;
}

export interface WebExtractProvider {
  providerName: string;
  extract(url: string, options?: WebExtractOptions): Promise<WebExtractResult | null>;
}
