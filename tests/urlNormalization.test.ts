import { describe, expect, it } from "vitest";
import { normalizeNullableContact, normalizeNullableUrl } from "../src/services/urlNormalization.js";

describe("normalizeNullableUrl", () => {
  it("keeps a valid https URL unchanged", () => {
    expect(normalizeNullableUrl("https://example.com/opportunities")).toBe("https://example.com/opportunities");
  });

  it("normalizes an empty string to null", () => {
    expect(normalizeNullableUrl("")).toBeNull();
  });

  it("normalizes unknown to null", () => {
    expect(normalizeNullableUrl("unknown")).toBeNull();
  });

  it("normalizes site officiel to null", () => {
    expect(normalizeNullableUrl("site officiel")).toBeNull();
  });

  it("normalizes invalid URL-like text to null", () => {
    expect(normalizeNullableUrl("https://")).toBeNull();
  });

  it("keeps email contacts unchanged", () => {
    expect(normalizeNullableContact("booking@example.com")).toBe("booking@example.com");
  });

  it("normalizes invalid URL-like contacts to null", () => {
    expect(normalizeNullableContact("https://")).toBeNull();
  });
});
