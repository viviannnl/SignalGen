import { describe, expect, it } from "vitest";

import { AuthContextError } from "./auth";
import { authContextErrorResponse, getApiAuthContextOrResponse } from "./api-auth";

describe("api auth response helpers", () => {
  it("serializes AUTH_REQUIRED as a 401 JSON response without leaking provider details", async () => {
    const response = authContextErrorResponse(new AuthContextError("AUTH_REQUIRED", "Authentication is required for this SignalGen workspace."));

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({
      error: "Authentication is required for this SignalGen workspace.",
      code: "AUTH_REQUIRED",
    });
  });

  it("returns null for non-auth errors so routes keep their existing error handling", () => {
    expect(authContextErrorResponse(new Error("mongo unavailable"))).toBeNull();
  });

  it("returns a response union instead of throwing for missing auth", async () => {
    const result = await getApiAuthContextOrResponse(new Request("http://localhost/api/runs"), {
      authProvider: async () => null,
    });

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(401);
    await expect(result.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED" });
  });
});
