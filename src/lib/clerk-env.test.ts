import { describe, expect, it } from "vitest";

import { hasUsableClerkPublishableKey } from "./clerk-env";

describe("Clerk environment helpers", () => {
  it.each([undefined, "", "***", "changeme", "change-me", "replace-me", " REPLACE-ME "])(
    "treats missing or placeholder publishable keys as disabled (%s)",
    (value) => {
      expect(hasUsableClerkPublishableKey(value)).toBe(false);
    },
  );

  it("treats a real-looking publishable key as enabled", () => {
    expect(hasUsableClerkPublishableKey("pk_test_1234567890")).toBe(true);
  });
});
