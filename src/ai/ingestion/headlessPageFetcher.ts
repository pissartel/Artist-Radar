import { warnLog } from "../../utils/logger.js";

const DEFAULT_NAVIGATION_TIMEOUT_MS = 20_000;
const CHALLENGE_SETTLE_WAIT_MS = 5_000;

export interface HeadlessPageFetcher {
  fetchRenderedHtml(url: string): Promise<string>;
}

/**
 * Renders a page in a real headless browser so that bot-protection challenges
 * (Cloudflare Managed Challenge, Turnstile, Vercel challenge) get a chance to
 * execute and clear, unlike a plain fetch(). Not guaranteed to succeed: some
 * challenges require genuine user interaction and will still block automation.
 */
export class PlaywrightHeadlessPageFetcher implements HeadlessPageFetcher {
  constructor(private readonly navigationTimeoutMs = DEFAULT_NAVIGATION_TIMEOUT_MS) {}

  async fetchRenderedHtml(url: string): Promise<string> {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
      });
      // "networkidle" never fires on pages that keep polling in the background
      // (e.g. Cloudflare Turnstile), so wait for DOM content and then give the
      // challenge a fixed window to resolve instead.
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: this.navigationTimeoutMs });
      await page.waitForTimeout(CHALLENGE_SETTLE_WAIT_MS);
      return await page.content();
    } finally {
      await browser.close();
    }
  }
}

/**
 * Creates a Playwright-backed fetcher, or returns null if the optional
 * `playwright` dependency/browser binaries are not installed. Ingestion must
 * keep working for plain-fetch sources even without Playwright available.
 */
export async function createHeadlessPageFetcherIfAvailable(): Promise<HeadlessPageFetcher | null> {
  try {
    await import("playwright");
    return new PlaywrightHeadlessPageFetcher();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLog("booking", `Headless fallback disabled: playwright is not available (${message}).`);
    return null;
  }
}
