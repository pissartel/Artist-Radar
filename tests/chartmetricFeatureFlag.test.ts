import { describe, expect, it } from "vitest";
import {
  resetChartmetricFeatureFlagCache,
  resolveChartmetricEnvironment,
  resolveChartmetricFeatureFlag
} from "../src/features/artist-enrichment/chartmetric/chartmetric.feature-flag.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("resolveChartmetricEnvironment", () => {
  it("prefers VERCEL_ENV when present", () => {
    expect(resolveChartmetricEnvironment({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(resolveChartmetricEnvironment({ VERCEL_ENV: "production" })).toBe("production");
  });

  it("falls back to NODE_ENV, treating anything but production as development", () => {
    expect(resolveChartmetricEnvironment({ NODE_ENV: "production" })).toBe("production");
    expect(resolveChartmetricEnvironment({ NODE_ENV: "test" })).toBe("development");
    expect(resolveChartmetricEnvironment({})).toBe("development");
  });
});

describe("resolveChartmetricFeatureFlag", () => {
  it("is disabled with reason missing_credentials when no refresh token is set", async () => {
    const resolution = await resolveChartmetricFeatureFlag({ env: { VERCEL_ENV: "production" } });
    expect(resolution.effectiveEnabled).toBe(false);
    expect(resolution.credentialsPresent).toBe(false);
    expect(resolution.reason).toBe("missing_credentials");
  });

  it("in production, effective state matches the server flag regardless of the request toggle", async () => {
    const enabled = await resolveChartmetricFeatureFlag({
      env: { CHARTMETRIC_REFRESH_TOKEN: "token", VERCEL_ENV: "production" },
      requestToggleEnabled: false
    });
    expect(enabled.effectiveEnabled).toBe(true);

    const disabled = await resolveChartmetricFeatureFlag({
      env: { CHARTMETRIC_REFRESH_TOKEN: "token", CHARTMETRIC_ARTIST_ENRICHMENT_ENABLED: "false", VERCEL_ENV: "production" },
      requestToggleEnabled: true
    });
    expect(disabled.effectiveEnabled).toBe(false);
    expect(disabled.reason).toBe("feature_disabled");
  });

  it("in preview/development, requires both the server flag and an explicit request toggle", async () => {
    const withoutToggle = await resolveChartmetricFeatureFlag({
      env: { CHARTMETRIC_REFRESH_TOKEN: "token", VERCEL_ENV: "development" }
    });
    expect(withoutToggle.effectiveEnabled).toBe(false);
    expect(withoutToggle.reason).toBe("feature_disabled");

    const withToggle = await resolveChartmetricFeatureFlag({
      env: { CHARTMETRIC_REFRESH_TOKEN: "token", VERCEL_ENV: "development" },
      requestToggleEnabled: true
    });
    expect(withToggle.effectiveEnabled).toBe(true);
  });

  it("fails closed when a configured remote flag service is unreachable", async () => {
    resetChartmetricFeatureFlagCache();
    const fetchImpl = async () => {
      throw new Error("network down");
    };
    const resolution = await resolveChartmetricFeatureFlag({
      env: {
        CHARTMETRIC_REFRESH_TOKEN: "token",
        VERCEL_ENV: "production",
        CHARTMETRIC_FLAG_SERVICE_URL: "https://flags.example/chartmetric"
      },
      fetchImpl: fetchImpl as typeof fetch
    });
    expect(resolution.effectiveEnabled).toBe(false);
    expect(resolution.remoteFlagAvailable).toBe(false);
    expect(resolution.reason).toBe("remote_flag_unavailable");
  });

  it("fails closed when the remote flag service returns a malformed payload", async () => {
    resetChartmetricFeatureFlagCache();
    const fetchImpl = async () => jsonResponse({ unrelated_field: true });
    const resolution = await resolveChartmetricFeatureFlag({
      env: {
        CHARTMETRIC_REFRESH_TOKEN: "token",
        VERCEL_ENV: "production",
        CHARTMETRIC_FLAG_SERVICE_URL: "https://flags.example/chartmetric"
      },
      fetchImpl: fetchImpl as typeof fetch
    });
    expect(resolution.effectiveEnabled).toBe(false);
    expect(resolution.remoteFlagAvailable).toBe(false);
  });

  it("uses the remote flag service's boolean value when it responds successfully", async () => {
    resetChartmetricFeatureFlagCache();
    const fetchImpl = async () => jsonResponse({ chartmetric_artist_enrichment: true });
    const resolution = await resolveChartmetricFeatureFlag({
      env: {
        CHARTMETRIC_REFRESH_TOKEN: "token",
        VERCEL_ENV: "production",
        CHARTMETRIC_FLAG_SERVICE_URL: "https://flags.example/chartmetric"
      },
      fetchImpl: fetchImpl as typeof fetch
    });
    expect(resolution.effectiveEnabled).toBe(true);
    expect(resolution.remoteFlagAvailable).toBe(true);
  });
});
