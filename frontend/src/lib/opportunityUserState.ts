// Local persistence for "interested"/"contacted" opportunity state, ahead of
// authentication/a real user database (issue #130 review feedback). Kept as
// a small, framework-agnostic store so it's easy to swap for an authenticated
// backend later without touching the components that call it.

export interface OpportunityUserState {
  interested: boolean;
  contacted: boolean;
  updatedAt: string;
}

export const DEFAULT_OPPORTUNITY_USER_STATE: OpportunityUserState = {
  interested: false,
  contacted: false,
  updatedAt: "",
};

const STORAGE_KEY = "next-stage:opportunity-state:v1";

type StateMap = Record<string, OpportunityUserState>;

type MinimalOpportunity = {
  id?: string | null;
  sourceUrls?: string[] | null;
};

const localListeners = new Set<() => void>();

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function isValidState(value: unknown): value is OpportunityUserState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.interested === "boolean" &&
    typeof candidate.contacted === "boolean" &&
    typeof candidate.updatedAt === "string"
  );
}

/** Reads and validates the whole state map, silently discarding malformed/corrupt localStorage data. */
function readStateMap(): StateMap {
  if (!hasLocalStorage()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

    const result: StateMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidState(value)) result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function writeStateMap(map: StateMap): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable (private browsing, quota exceeded, disabled): fail silently.
  }
}

/** Deterministic ID from the normalized source URL, used only when the opportunity has no stable id. */
function buildUrlBasedKey(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    return `source:${host}${path}`.toLowerCase();
  } catch {
    return `source:${url.trim().toLowerCase()}`;
  }
}

/** Prefers the opportunity's own stable id; falls back to a URL-derived key. Never uses a title or array index. */
export function buildOpportunityStateKey(opportunity: MinimalOpportunity): string {
  if (opportunity.id) return opportunity.id;
  const url = opportunity.sourceUrls?.[0];
  if (url) return buildUrlBasedKey(url);
  return "unknown";
}

export function getOpportunityUserState(key: string): OpportunityUserState {
  return readStateMap()[key] ?? DEFAULT_OPPORTUNITY_USER_STATE;
}

export function setOpportunityUserState(
  key: string,
  patch: Partial<Pick<OpportunityUserState, "interested" | "contacted">>
): OpportunityUserState {
  const map = readStateMap();
  const current = map[key] ?? DEFAULT_OPPORTUNITY_USER_STATE;
  const next: OpportunityUserState = { ...current, ...patch, updatedAt: new Date().toISOString() };
  map[key] = next;
  writeStateMap(map);
  localListeners.forEach((listener) => listener());
  return next;
}

/** Notifies on same-tab changes (local listeners) and cross-tab changes (the `storage` event). SSR-safe no-op when there's no window. */
export function subscribeToOpportunityUserState(onChange: () => void): () => void {
  localListeners.add(onChange);

  const hasWindow = typeof window !== "undefined";
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  if (hasWindow) {
    window.addEventListener("storage", handleStorageEvent);
  }

  return () => {
    localListeners.delete(onChange);
    if (hasWindow) {
      window.removeEventListener("storage", handleStorageEvent);
    }
  };
}
