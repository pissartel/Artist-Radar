export const ONBOARDING_STORAGE_KEY = "artistRadarOnboardingData";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readWorkspace(storage: StorageLike): unknown | null {
  try {
    const raw = storage.getItem(ONBOARDING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface SynchronizeWorkspaceOptions {
  storage: StorageLike;
  readRemote: () => Promise<unknown | null>;
  persistLocal: (workspace: unknown) => Promise<void>;
  notifyRestored: () => void;
}

export async function synchronizeOnboardingWorkspace({
  storage,
  readRemote,
  persistLocal,
  notifyRestored,
}: SynchronizeWorkspaceOptions): Promise<"local" | "remote" | "empty"> {
  const localAtStart = readWorkspace(storage);
  if (localAtStart) {
    await persistLocal(localAtStart);
    return "local";
  }

  const remote = await readRemote();
  if (!remote) return "empty";

  // Anonymous onboarding can complete while the Supabase request is in
  // flight. Re-read before restoring so a complete Paris/France request is
  // never downgraded by an older workspace.
  const currentLocal = readWorkspace(storage);
  if (currentLocal) {
    await persistLocal(currentLocal);
    return "local";
  }

  storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(remote));
  notifyRestored();
  return "remote";
}
