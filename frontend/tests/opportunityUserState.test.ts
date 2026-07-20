import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOpportunityStateKey,
  DEFAULT_OPPORTUNITY_USER_STATE,
  getOpportunityUserState,
  setOpportunityUserState,
} from "@/lib/opportunityUserState";

function createFakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

describe("opportunityUserState", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createFakeLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("buildOpportunityStateKey", () => {
    it("prefers the opportunity's own stable id", () => {
      expect(buildOpportunityStateKey({ id: "razibus-soiree-punk-rennes" })).toBe("razibus-soiree-punk-rennes");
    });

    it("falls back to a normalized source URL when there is no id", () => {
      const key = buildOpportunityStateKey({ sourceUrls: ["https://www.razibus.net/some-event.html?ref=agenda"] });
      expect(key).toBe("source:razibus.net/some-event.html");
    });

    it("normalizes equivalent URLs (www, trailing slash) to the same key", () => {
      const a = buildOpportunityStateKey({ sourceUrls: ["https://www.razibus.net/event/"] });
      const b = buildOpportunityStateKey({ sourceUrls: ["https://razibus.net/event"] });
      expect(a).toBe(b);
    });

    it("never uses a title or falls back to an array index", () => {
      const key = buildOpportunityStateKey({});
      expect(key).toBe("unknown");
    });
  });

  describe("getOpportunityUserState / setOpportunityUserState", () => {
    it("returns the default state for an unknown key", () => {
      expect(getOpportunityUserState("some-id")).toEqual(DEFAULT_OPPORTUNITY_USER_STATE);
    });

    it("persists interested/contacted state across reads", () => {
      setOpportunityUserState("opp-1", { interested: true });
      expect(getOpportunityUserState("opp-1").interested).toBe(true);
      expect(getOpportunityUserState("opp-1").contacted).toBe(false);

      setOpportunityUserState("opp-1", { contacted: true });
      expect(getOpportunityUserState("opp-1")).toMatchObject({ interested: true, contacted: true });
    });

    it("keeps state isolated per opportunity id", () => {
      setOpportunityUserState("opp-1", { interested: true });
      setOpportunityUserState("opp-2", { contacted: true });
      expect(getOpportunityUserState("opp-1")).toMatchObject({ interested: true, contacted: false });
      expect(getOpportunityUserState("opp-2")).toMatchObject({ interested: false, contacted: true });
    });

    it("stores state under the namespaced, versioned key", () => {
      setOpportunityUserState("opp-1", { interested: true });
      expect(localStorage.getItem("next-stage:opportunity-state:v1")).not.toBeNull();
    });

    it("recovers from malformed JSON in localStorage instead of throwing", () => {
      localStorage.setItem("next-stage:opportunity-state:v1", "{not valid json");
      expect(() => getOpportunityUserState("opp-1")).not.toThrow();
      expect(getOpportunityUserState("opp-1")).toEqual(DEFAULT_OPPORTUNITY_USER_STATE);
    });

    it("recovers from a non-object JSON value in localStorage", () => {
      localStorage.setItem("next-stage:opportunity-state:v1", "[1,2,3]");
      expect(getOpportunityUserState("opp-1")).toEqual(DEFAULT_OPPORTUNITY_USER_STATE);
    });

    it("discards individually malformed entries but keeps valid ones", () => {
      localStorage.setItem(
        "next-stage:opportunity-state:v1",
        JSON.stringify({
          "opp-1": { interested: true, contacted: false, updatedAt: "2026-07-20T00:00:00.000Z" },
          "opp-2": { interested: "yes" },
        })
      );
      expect(getOpportunityUserState("opp-1").interested).toBe(true);
      expect(getOpportunityUserState("opp-2")).toEqual(DEFAULT_OPPORTUNITY_USER_STATE);
    });
  });
});
