import { describe, expect, it, vi, beforeEach } from "vitest";

import { buildGitHubAppInstallState } from "../../../../../lib/github-app-install";

const mockUpsert = vi.hoisted(() => vi.fn());

vi.mock("@/lib/github-installation-db", () => ({
  upsertGitHubInstallation: mockUpsert,
}));

vi.mock("@/lib/workspace", () => ({
  resolveWorkspaceId: () => "workspace-test",
}));

const SECRET = "test-s...ngth";
const NOW = "2026-05-25T13:00:00.000Z";

function stubGitHubAppEnv() {
  vi.stubEnv("SIGNALGEN_GITHUB_APP_SLUG", "signalgen-dev");
  vi.stubEnv("SIGNALGEN_GITHUB_APP_STATE_SECRET", SECRET);
}

function signedState() {
  return buildGitHubAppInstallState({
    workspaceId: "workspace-test",
    secret: SECRET,
    now: NOW,
    nonce: "nonce-1",
  });
}

describe("/api/github/install/callback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    mockUpsert.mockReset();
    mockUpsert.mockResolvedValue(undefined);
  });

  it("persists a valid GitHub App installation callback and redirects to the dashboard", async () => {
    stubGitHubAppEnv();
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        `http://localhost/api/github/install/callback?installation_id=12345&setup_action=install&state=${encodeURIComponent(signedState())}`,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/dashboard");
    expect(mockUpsert).toHaveBeenCalledOnce();
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-test",
        installationId: "12345",
        setupAction: "install",
        installedAt: NOW,
        status: "active",
      },
      NOW,
    );
  });

  it("returns 503 without exposing details when installation persistence fails", async () => {
    stubGitHubAppEnv();
    mockUpsert.mockRejectedValue(new Error("mongo unavailable"));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        `http://localhost/api/github/install/callback?installation_id=12345&setup_action=install&state=${encodeURIComponent(signedState())}`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "GitHub App installation could not be saved. Please try again." });
  });

  it("rejects a callback with missing installation_id", async () => {
    stubGitHubAppEnv();
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        `http://localhost/api/github/install/callback?setup_action=install&state=${encodeURIComponent(signedState())}`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "installation_id is required" });
  });

  it("rejects an invalid state", async () => {
    stubGitHubAppEnv();
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/github/install/callback?installation_id=12345&setup_action=install&state=bad"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Invalid GitHub App install state", reason: "MalformedState" });
  });

  it("rejects a non-numeric installation_id", async () => {
    stubGitHubAppEnv();
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        `http://localhost/api/github/install/callback?installation_id=abc&setup_action=install&state=${encodeURIComponent(signedState())}`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "installation_id must be numeric" });
  });

  it("rejects an unsupported setup_action", async () => {
    stubGitHubAppEnv();
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        `http://localhost/api/github/install/callback?installation_id=12345&setup_action=remove&state=${encodeURIComponent(signedState())}`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "setup_action must be install or update" });
  });
});
