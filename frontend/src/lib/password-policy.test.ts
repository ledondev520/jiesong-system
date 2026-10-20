import { describe, expect, it } from "vitest";
import { isValidPassword } from "./password-policy";
describe("new-password policy", () => {
  it("counts Unicode characters and enforces the bcrypt UTF-8 byte limit", () => {
    for (const value of ["short", "a".repeat(73), "密".repeat(25)])
      expect(isValidPassword(value)).toBe(false);
    for (const value of [
      "test-only-new-password",
      "a".repeat(72),
      "密".repeat(24),
      "🙂".repeat(8),
    ])
      expect(isValidPassword(value)).toBe(true);
  });
});
