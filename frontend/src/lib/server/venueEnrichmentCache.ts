import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CachedVenueEnrichment } from "@/types/venueEnrichment";

export interface VenueEnrichmentCache {
  get(venueId: string): Promise<CachedVenueEnrichment | null>;
  set(record: CachedVenueEnrichment): Promise<void>;
}

type CacheFileShape = Record<string, Omit<CachedVenueEnrichment, "cacheHit">>;

export class FileVenueEnrichmentCache implements VenueEnrichmentCache {
  private writeQueue = Promise.resolve();

  constructor(private readonly filePath = defaultVenueEnrichmentCachePath()) {}

  async get(venueId: string): Promise<CachedVenueEnrichment | null> {
    const data = await this.readAll();
    const record = data[venueId];
    return record ? { ...record, cacheHit: true } : null;
  }

  async set(record: CachedVenueEnrichment): Promise<void> {
    // A previous filesystem failure must not permanently poison subsequent
    // writes in a warm serverless instance.
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      const data = await this.readAll();
      const { cacheHit: _cacheHit, ...persisted } = record;
      data[record.venueId] = persisted;
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
    });
    await this.writeQueue;
  }

  private async readAll(): Promise<CacheFileShape> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      return isCacheFileShape(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
}

let defaultCache: FileVenueEnrichmentCache | null = null;

export function getDefaultVenueEnrichmentCache(): VenueEnrichmentCache {
  defaultCache ??= new FileVenueEnrichmentCache();
  return defaultCache;
}

function defaultVenueEnrichmentCachePath(): string {
  if (process.env.VENUE_ENRICHMENT_CACHE_PATH) return process.env.VENUE_ENRICHMENT_CACHE_PATH;
  if (
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.cwd().startsWith("/var/task")
  ) {
    return path.join(os.tmpdir(), "artist-radar", "venue-enrichments.json");
  }
  const root = process.cwd().endsWith("frontend") ? path.resolve(process.cwd(), "..") : process.cwd();
  return path.join(root, ".cache", "venue-enrichments.json");
}

function isCacheFileShape(value: unknown): value is CacheFileShape {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
