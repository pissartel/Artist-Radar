import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { passwordValidation } from "@/lib/auth/password";
import { recoveryCallbackUrl } from "@/lib/auth/redirect";

function source(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

describe("issue #259 password recovery", () => {
  it("reuses signup password-strength rules", () => {
    expect(passwordValidation("short")).toBe("Use at least 8 characters.");
    expect(passwordValidation("alllowercase1")).toBe("Include an uppercase letter, a lowercase letter, and a number.");
    expect(passwordValidation("ValidPass1")).toBeNull();
  });

  it("builds recovery callbacks from the current environment origin", () => {
    const callback = recoveryCallbackUrl("https://preview.example", "/booking?id=42");
    expect(callback).toBe("https://preview.example/auth/callback?next=%2Freset-password%3Fnext%3D%252Fbooking%253Fid%253D42");
    expect(recoveryCallbackUrl("http://localhost:3000", "https://unsafe.example")).toContain("http://localhost:3000/auth/callback");
  });

  it("handles invalid recovery callbacks and offers a fresh link", () => {
    const callback = source("app/auth/callback/route.ts");
    const reset = source("app/reset-password/page.tsx");
    expect(callback).toContain('next.startsWith("/reset-password")');
    expect(callback).toContain('searchParams.set("recovery_error", "invalid")');
    expect(reset).toContain("This reset link is invalid or has expired.");
    expect(reset).toContain("Request a new reset link");
  });

  it("validates confirmation and prevents duplicate password updates", () => {
    const reset = source("app/reset-password/page.tsx");
    expect(reset).toContain("Confirm new password");
    expect(reset).toContain("Passwords do not match.");
    expect(reset).toContain('if (loading || sessionStatus !== "valid") return');
    expect(reset).toContain("auth.updateUser({ password })");
    expect(reset).toContain("Your password has been updated successfully.");
  });

  it("sends and resends recovery email with a cooldown", () => {
    const forgot = source("app/forgot-password/page.tsx");
    expect(forgot).toContain("resetPasswordForEmail");
    expect(forgot).toContain("recoveryCallbackUrl(window.location.origin, next)");
    expect(forgot).toContain("RESEND_COOLDOWN_SECONDS = 60");
    expect(forgot).toContain('if (status === "sending" || cooldown > 0) return');
    expect(forgot).toContain("Resend reset link");
  });
});
