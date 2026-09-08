import { describe, expect, it, vi } from "vitest";
import {
  ARTIST_RADAR_ONBOARDING_STORAGE_KEY,
  synchronizeArtistWorkspace,
} from "@/lib/workspaceSynchronization";

function createStorage(initial?: unknown) {
  const values = new Map<string, string>();
  if (initial) {
    values.set(ARTIST_RADAR_ONBOARDING_STORAGE_KEY, JSON.stringify(initial));
  }
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

const CURRENT = {
  artistName: "Tuesday Fall",
  mainGenre: "pop punk",
  city: "Paris",
  countryOfOrigin: "France",
  mainGoal: "booking_opportunities",
};

const STALE_REMOTE = {
  artistName: "Previous Artist",
  mainGenre: "classical",
  city: "Paris",
  countryOfOrigin: "Worldwide",
  mainGoal: "booking_opportunities",
};

describe("workspace synchronization", () => {
  it("keeps and persists an existing anonymous workspace after signup", async () => {
    const storage = createStorage(CURRENT);
    const readRemoteWorkspace = vi.fn(async () => STALE_REMOTE);
    const persistLocalWorkspace = vi.fn(async () => undefined);
    const notify = vi.fn();

    await expect(
      synchronizeArtistWorkspace({
        storage,
        readRemoteWorkspace,
        persistLocalWorkspace,
        notifyRemoteWorkspaceRestored: notify,
      })
    ).resolves.toBe("local-persisted");

    expect(persistLocalWorkspace).toHaveBeenCalledWith(CURRENT);
    expect(readRemoteWorkspace).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("restores a saved workspace once when no local analysis exists", async () => {
    const storage = createStorage();
    const notify = vi.fn();

    await expect(
      synchronizeArtistWorkspace({
        storage,
        readRemoteWorkspace: async () => STALE_REMOTE,
        persistLocalWorkspace: async () => undefined,
        notifyRemoteWorkspaceRestored: notify,
      })
    ).resolves.toBe("remote-restored");

    expect(JSON.parse(storage.getItem(ARTIST_RADAR_ONBOARDING_STORAGE_KEY)!)).toEqual(STALE_REMOTE);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an authenticated user with no local or saved workspace", async () => {
    const notify = vi.fn();

    await expect(
      synchronizeArtistWorkspace({
        storage: createStorage(),
        readRemoteWorkspace: async () => null,
        persistLocalWorkspace: async () => undefined,
        notifyRemoteWorkspaceRestored: notify,
      })
    ).resolves.toBe("empty");
    expect(notify).not.toHaveBeenCalled();
  });

  it("cannot overwrite onboarding created while the Supabase read is in flight", async () => {
    const storage = createStorage();
    let resolveRemote!: (workspace: unknown) => void;
    const remote = new Promise<unknown>((resolve) => {
      resolveRemote = resolve;
    });
    const persistLocalWorkspace = vi.fn(async () => undefined);
    const notify = vi.fn();

    const synchronization = synchronizeArtistWorkspace({
      storage,
      readRemoteWorkspace: () => remote,
      persistLocalWorkspace,
      notifyRemoteWorkspaceRestored: notify,
    });

    storage.setItem(ARTIST_RADAR_ONBOARDING_STORAGE_KEY, JSON.stringify(CURRENT));
    resolveRemote(STALE_REMOTE);

    await expect(synchronization).resolves.toBe("local-persisted");
    expect(JSON.parse(storage.getItem(ARTIST_RADAR_ONBOARDING_STORAGE_KEY)!)).toEqual(CURRENT);
    expect(persistLocalWorkspace).toHaveBeenCalledWith(CURRENT);
    expect(notify).not.toHaveBeenCalled();
  });
});
