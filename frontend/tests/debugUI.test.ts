import { afterEach, describe, expect, it, vi } from "vitest";
import { isDebugUIVisible } from "@/lib/server/debugUI";

// Issue #201 follow-up: the "Heads Up (Debug)" warnings panel and "Raw
// JSON" tab were observed live in Production — NEXT_PUBLIC_ENABLE_DEBUG_UI
// alone was the only gate, so a misconfigured Production env var leaked
// developer-only UI to real users. Mirrors chartmetricToggle.test.ts.
describe("isDebugUIVisible", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("never shows debug UI in production, even if the public toggle var is accidentally left true", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEBUG_UI", "true");
    expect(isDebugUIVisible()).toBe(false);
  });

  it("stays hidden in production when the public toggle var is unset", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEBUG_UI", "");
    expect(isDebugUIVisible()).toBe(false);
  });

  it("shows debug UI in preview only when the public toggle var is true", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEBUG_UI", "true");
    expect(isDebugUIVisible()).toBe(true);
  });

  it("stays hidden in preview when the public toggle var is false or missing", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEBUG_UI", "");
    expect(isDebugUIVisible()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEBUG_UI", "false");
    expect(isDebugUIVisible()).toBe(false);
  });

  it("behaves like preview in local development", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEBUG_UI", "true");
    expect(isDebugUIVisible()).toBe(true);
  });
});
