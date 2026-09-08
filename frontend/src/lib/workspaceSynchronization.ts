export const ARTIST_RADAR_ONBOARDING_STORAGE_KEY = "artistRadarOnboardingData";

export type WorkspaceSynchronizationResult =
  | "local-persisted"
  | "remote-restored"
  | "empty";

interface WorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface SynchronizeWorkspaceOptions {
  storage: WorkspaceStorage;
  readRemoteWorkspace: () => Promise<unknown | null>;
  persistLocalWorkspace: (workspace: unknown) => Promise<void>;
  notifyRemoteWorkspaceRestored: () => void;
}

function readLocalWorkspace(storage: WorkspaceStorage): unknown | null {
  try {
    const stored = storage.getItem(ARTIST_RADAR_ONBOARDING_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Synchronizes a user's workspace without allowing an asynchronous remote
 * read to overwrite onboarding data created locally while that read was in
 * flight. Local data always wins and only a real remote restoration emits the
 * event consumed by the analysis hook.
 */
export async function synchronizeArtistWorkspace({
  storage,
  readRemoteWorkspace,
  persistLocalWorkspace,
  notifyRemoteWorkspaceRestored,
}: SynchronizeWorkspaceOptions): Promise<WorkspaceSynchronizationResult> {
  const initialLocalWorkspace = readLocalWorkspace(storage);
  if (initialLocalWorkspace) {
    await persistLocalWorkspace(initialLocalWorkspace);
    return "local-persisted";
  }

  const remoteWorkspace = await readRemoteWorkspace();
  if (!remoteWorkspace) return "empty";

  // The user may have completed anonymous onboarding while Supabase was
  // loading. Re-read storage so that current input cannot be replaced by a
  // stale saved workspace.
  const currentLocalWorkspace = readLocalWorkspace(storage);
  if (currentLocalWorkspace) {
    await persistLocalWorkspace(currentLocalWorkspace);
    return "local-persisted";
  }

  storage.setItem(
    ARTIST_RADAR_ONBOARDING_STORAGE_KEY,
    JSON.stringify(remoteWorkspace)
  );
  notifyRemoteWorkspaceRestored();
  return "remote-restored";
}
