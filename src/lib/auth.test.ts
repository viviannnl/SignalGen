import { describe, expect, it, vi } from "vitest";

import { AuthContextError, isDemoAuthAllowed, requireAuthContext } from "./auth";

async function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(env)) {
    previous.set(key, process.env[key]);
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("auth/workspace context scaffold", () => {
  it("fails closed when no authenticated session is available and demo mode is not allowed", async () => {
    await withEnv({ SIGNALGEN_ALLOW_DEMO_AUTH: undefined, NODE_ENV: "production" }, async () => {
      await expect(requireAuthContext(new Request("http://localhost/api/runs"), { authProvider: async () => ({ userId: null, orgId: null }) })).rejects.toMatchObject({
        code: "AUTH_REQUIRED",
        status: 401,
      });
    });
  });

  it("fails closed instead of falling back to demo when the default Clerk context cannot be resolved", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await withEnv({ SIGNALGEN_ALLOW_DEMO_AUTH: undefined, NODE_ENV: "production" }, async () => {
        await expect(requireAuthContext(new Request("http://localhost/api/runs"))).rejects.toMatchObject({
          code: "AUTH_REQUIRED",
          status: 401,
        });
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("resolves a Clerk authenticated organization session into a SignalGen auth context", async () => {
    const context = await requireAuthContext(new Request("http://localhost/api/runs"), {
      authProvider: async () => ({
        userId: "user_123",
        orgId: "org_abc",
        orgRole: "org:admin",
      }),
    });

    expect(context).toEqual({
      mode: "authenticated",
      userId: "user_123",
      workspaceId: "org_abc",
      role: "admin",
      provider: "clerk",
    });
  });

  it("requires a Clerk organization before granting a workspace context", async () => {
    await expect(
      requireAuthContext(new Request("http://localhost/api/runs"), {
        authProvider: async () => ({
          userId: "user_123",
          orgId: null,
          orgRole: null,
        }),
      }),
    ).rejects.toMatchObject({
      code: "WORKSPACE_REQUIRED",
      status: 403,
    });
  });

  it("maps unknown Clerk organization roles to least-privilege member", async () => {
    const context = await requireAuthContext(new Request("http://localhost/api/runs"), {
      authProvider: async () => ({
        userId: "user_123",
        orgId: "org_abc",
        orgRole: "org:billing_manager",
      }),
    });

    expect(context.role).toBe("member");
  });

  it("allows demo auth only when both caller and environment explicitly allow it", async () => {
    await withEnv({ SIGNALGEN_ALLOW_DEMO_AUTH: "1", NODE_ENV: "production" }, async () => {
      const context = await requireAuthContext(new Request("http://localhost/api/runs"), { allowDemo: true, authProvider: async () => null });

      expect(context).toEqual({
        mode: "demo",
        userId: "demo-user",
        workspaceId: "demo",
        role: "owner",
      });
    });
  });

  it("does not enable demo auth when the route did not explicitly allow demo fallback", async () => {
    await withEnv({ SIGNALGEN_ALLOW_DEMO_AUTH: "1", NODE_ENV: "production" }, async () => {
      await expect(requireAuthContext(new Request("http://localhost/api/runs"), { authProvider: async () => null })).rejects.toBeInstanceOf(AuthContextError);
    });
  });

  it("uses trusted test auth headers outside production for access-boundary tests", async () => {
    await withEnv({ NODE_ENV: "test" }, async () => {
      const context = await requireAuthContext(
        new Request("http://localhost/api/runs", {
          headers: {
            "x-signalgen-test-user-id": "user-alice",
            "x-signalgen-test-workspace-id": "workspace-a",
            "x-signalgen-test-role": "admin",
          },
        }),
      );

      expect(context).toEqual({
        mode: "authenticated",
        userId: "user-alice",
        workspaceId: "workspace-a",
        role: "admin",
      });
    });
  });

  it("never trusts test auth headers in production", async () => {
    await withEnv({ SIGNALGEN_ALLOW_DEMO_AUTH: undefined, NODE_ENV: "production" }, async () => {
      await expect(
        requireAuthContext(
          new Request("http://localhost/api/runs", {
            headers: {
              "x-signalgen-test-user-id": "user-alice",
              "x-signalgen-test-workspace-id": "workspace-a",
            },
          }),
          { authProvider: async () => null },
        ),
      ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    });
  });

  it("keeps the demo auth switch explicit", () => {
    vi.stubEnv("SIGNALGEN_ALLOW_DEMO_AUTH", "true");
    expect(isDemoAuthAllowed()).toBe(true);
    vi.stubEnv("SIGNALGEN_ALLOW_DEMO_AUTH", "0");
    expect(isDemoAuthAllowed()).toBe(false);
    vi.unstubAllEnvs();
  });
});
