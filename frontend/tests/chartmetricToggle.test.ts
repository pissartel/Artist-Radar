import { afterEach, describe, expect, it, vi } from "vitest";
import { isChartmetricToggleVisible } from "@/lib/server/chartmetricToggle";

describe("isChartmetricToggleVisible", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("never shows the checkbox in production, even if the public toggle var is accidentally left true", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CHARTMETRIC_TOGGLE", "true");
    expect(isChartmetricToggleVisible()).toBe(false);
  });

  it("stays hidden in production when the public toggle var is unset", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CHARTMETRIC_TOGGLE", "");
    expect(isChartmetricToggleVisible()).toBe(false);
  });

  it("shows the checkbox in preview only when the public toggle var is true", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CHARTMETRIC_TOGGLE", "true");
    expect(isChartmetricToggleVisible()).toBe(true);
  });

  it("stays hidden in preview when the public toggle var is false or missing", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CHARTMETRIC_TOGGLE", "");
    expect(isChartmetricToggleVisible()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_ENABLE_CHARTMETRIC_TOGGLE", "false");
    expect(isChartmetricToggleVisible()).toBe(false);
  });

  it("behaves like preview in local development", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CHARTMETRIC_TOGGLE", "true");
    expect(isChartmetricToggleVisible()).toBe(true);
  });
});
