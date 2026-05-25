import { describe, expect, it, vi, beforeEach } from "vitest";

import { buildGitHubAppInstallState } from "../../../../../lib/github-app-install";

vi.mock("@/lib/workspace", () => ({
  resolveWorkspaceId: () => "workspace-test",
}));

const SECRET = "test-state-secret-with-enough-length";
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
  });

  it("accepts a valid GitHub App installation callback without enabling write capabilities", async () => {
    stubGitHubAppEnv();
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        `http://localhost/api/github/install/callback?installation_id=12345&setup_action=install&state=${encodeURIComponent(signedState())}`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      installation: {
        installationId: "12345",
        setupAction: "install",
        workspaceId: "workspace-test",
        status: "pending_repo_selection",
        capabilities: {
          pr_creation: false,
          branch_push: false,
          issue_creation: false,
        },
      },
      message: "GitHub App installation received. Select and verify a repository before any write capability can be enabled.",
    });
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
