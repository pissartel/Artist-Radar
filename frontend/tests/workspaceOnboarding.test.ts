import { describe, expect, it, vi } from "vitest";
import {
  ONBOARDING_STORAGE_KEY,
  synchronizeOnboardingWorkspace,
} from "@/lib/workspaceOnboarding";

function storageWith(initial?: unknown) {
  const values = new Map<string, string>();
  if (initial) values.set(ONBOARDING_STORAGE_KEY, JSON.stringify(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

const COMPLETE = {
  artistName: "Tuesday Fall",
  mainGenre: "pop punk",
  city: "Paris",
  countryOfOrigin: "France",
  targetLocation: "France",
};

describe("auth workspace onboarding synchronization", () => {
  it("preserves all booking context fields when persisting a local workspace", async () => {
    const storage = storageWith(COMPLETE);
    const persistLocal = vi.fn(async () => undefined);

    await synchronizeOnboardingWorkspace({
      storage,
      readRemote: async () => null,
      persistLocal,
      notifyRestored: vi.fn(),
    });

    expect(persistLocal).toHaveBeenCalledWith(COMPLETE);
  });

  it("does not downgrade Paris/France when a stale remote workspace resolves later", async () => {
    const storage = storageWith();
    let resolveRemote!: (value: unknown) => void;
    const remote = new Promise<unknown>((resolve) => { resolveRemote = resolve; });
    const notifyRestored = vi.fn();

    const synchronization = synchronizeOnboardingWorkspace({
      storage,
      readRemote: () => remote,
      persistLocal: async () => undefined,
      notifyRestored,
    });
    storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(COMPLETE));
    resolveRemote({ artistName: "Tuesday Fall", mainGenre: "pop punk" });

    await expect(synchronization).resolves.toBe("local");
    expect(JSON.parse(storage.getItem(ONBOARDING_STORAGE_KEY)!)).toEqual(COMPLETE);
    expect(notifyRestored).not.toHaveBeenCalled();
  });
});
