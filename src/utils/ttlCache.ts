// Small in-memory TTL cache shared by the structured label-discovery
// providers (MusicBrainz, Discogs, official-page enrichment) so the same
// artist/release/label/URL is never re-fetched twice within a pipeline run.
// getOrCreate() also de-dupes concurrent in-flight requests for the same key
// and never caches a rejected promise, so a transient failure doesn't poison
// the cache for subsequent lookups.
export class TtlCache<K, V> {
  private readonly store = new Map<K, { value: V; expiresAt: number }>();
  private readonly pending = new Map<K, Promise<V>>();

  constructor(private readonly ttlMs: number) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  set(key: K, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  async getOrCreate(key: K, factory: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const pending = this.pending.get(key);
    if (pending) {
      return pending;
    }

    const promise = factory()
      .then((value) => {
        this.set(key, value);
        this.pending.delete(key);
        return value;
      })
      .catch((error) => {
        this.pending.delete(key);
        throw error;
      });

    this.pending.set(key, promise);
    return promise;
  }

  clear(): void {
    this.store.clear();
    this.pending.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
