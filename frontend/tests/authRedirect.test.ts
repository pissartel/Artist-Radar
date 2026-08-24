import { describe, expect, it } from "vitest";
import { authHref, safeRedirectPath } from "@/lib/auth/redirect";

describe("authentication redirects", () => {
  it("keeps local context paths", () => expect(safeRedirectPath("/booking?id=42")).toBe("/booking?id=42"));
  it("rejects absolute and protocol-relative redirects", () => {
    expect(safeRedirectPath("https://example.com")).toBe("/overview");
    expect(safeRedirectPath("//example.com")).toBe("/overview");
  });
  it("includes the return path in auth links", () => expect(authHref("/register", "/overview")).toBe("/register?next=%2Foverview"));
});
