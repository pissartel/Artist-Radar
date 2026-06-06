import { afterEach, describe, expect, it, vi } from "vitest";
import { debugLog, isDebugEnabled, warnLog } from "../src/utils/logger.js";

describe("logger", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns false when a debug scope is disabled", () => {
    vi.stubEnv("DEBUG_SPOTIFY", "false");

    expect(isDebugEnabled("spotify")).toBe(false);
  });

  it("returns true when a debug scope is enabled", () => {
    vi.stubEnv("DEBUG_SIMILAR_ARTISTS", "true");

    expect(isDebugEnabled("similar-artists")).toBe(true);
  });

  it("prints debug logs only when the relevant flag is enabled", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("DEBUG_PROFILE", "true");

    debugLog("profile", "profile debug", { artistName: "Fake Band" });

    expect(log).toHaveBeenCalledWith(expect.stringContaining("[profile] profile debug"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"artistName":"Fake Band"'));
  });

  it("does not print debug logs when the relevant flag is disabled", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("DEBUG_YOUTUBE", "false");

    debugLog("youtube", "youtube debug", { youtubeApiKeyPresent: true });

    expect(log).not.toHaveBeenCalled();
  });

  it("redacts dangerous keys in logged data", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    warnLog("spotify", "redaction test", {
      apiKey: "secret-api-key",
      clientSecret: "secret-client-secret",
      authorization: "Bearer abc123",
      token: "token-value",
      nested: {
        Authorization: "Bearer nested"
      }
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"apiKey":"[redacted]"')
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"clientSecret":"[redacted]"')
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"authorization":"[redacted]"')
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"token":"[redacted]"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Authorization":"[redacted]"'));
  });
});
