import { beforeEach, describe, expect, it, vi } from "vitest";

const AUTH_HEADERS = {
  "x-signalgen-test-user-id": "user-test",
  "x-signalgen-test-workspace-id": "workspace-test",
  "x-signalgen-test-role": "owner",
};

function authedRequest(input: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(AUTH_HEADERS)) {
    headers.set(key, value);
  }
  return new Request(input, { ...init, headers });
}

vi.mock("@/lib/workspace", () => ({
  resolveWorkspaceId: () => "workspace-test",
}));

const SECRET="***";

function stubGitHubAppEnv() {
  vi.stubEnv("SIGNALGEN_GITHUB_APP_SLUG", "signalgen-dev");
  vi.stubEnv("SIGNALGEN_GITHUB_APP_STATE_SECRET", SECRET);
}

describe("/api/github/install", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("redirects to the configured GitHub App installation URL", async () => {
    stubGitHubAppEnv();
    const { GET } = await import("./route");

    const response = await GET(authedRequest("http://localhost/api/github/install"));

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toMatch(/^https:\/\/github\.com\/apps\/signalgen-dev\/installations\/new\?state=.+/);
    expect(location).not.toContain(SECRET);
  });

  it("fails closed when GitHub App env is missing", async () => {
    vi.stubEnv("SIGNALGEN_GITHUB_APP_SLUG", "");
    vi.stubEnv("SIGNALGEN_GITHUB_APP_STATE_SECRET", "");
    const { GET } = await import("./route");

    const response = await GET(authedRequest("http://localhost/api/github/install"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "GitHub App install is not configured",
      missing: ["SIGNALGEN_GITHUB_APP_SLUG", "SIGNALGEN_GITHUB_APP_STATE_SECRET"],
    });
  });
});
