/**
 * Runs `task` over `items` with at most `limit` concurrent executions,
 * preserving input order in the returned array. Used to bound fan-out
 * against external providers (e.g. one call per similar artist) without
 * pulling in a dependency for a handful of lines of logic.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const boundedLimit = Math.max(1, Math.min(limit, items.length) || 1);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await task(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: boundedLimit }, () => worker()));
  return results;
}
