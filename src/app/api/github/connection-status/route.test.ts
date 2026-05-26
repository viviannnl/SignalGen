import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RepoConnection } from "@/lib/types";

const mockFindGitHubInstallationByWorkspace = vi.hoisted(() => vi.fn());
const mockListRepoConnectionsByWorkspace = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(),
}));

vi.mock("@/lib/github-installation-db", () => ({
  findGitHubInstallationByWorkspace: mockFindGitHubInstallationByWorkspace,
}));

vi.mock("@/lib/repo-connection-db", () => ({
  listRepoConnectionsByWorkspace: mockListRepoConnectionsByWorkspace,
}));

vi.mock("@/lib/workspace", () => ({
  resolveWorkspaceId: () => "workspace-test",
}));

const NOW = "2026-05-25T13:00:00.000Z";

function makeInstallation() {
  return {
    _id: "installation-record-1",
    workspaceId: "workspace-test",
    installationId: "12345",
    setupAction: "install" as const,
    installedAt: NOW,
    status: "active" as const,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeRepoConnection(overrides: Partial<RepoConnection> = {}): RepoConnection {
  return {
    _id: "connection-1",
    workspaceId: "workspace-test",
    provider: "github",
    owner: "viviannnl",
    repo: "ai-cover-letter",
    defaultBranch: "main",
    installationId: "12345",
    capabilities: {
      pr_creation: false,
      branch_push: false,
      issue_creation: false,
    },
    status: "connected",
    disabledReason: "GitHub App installation requires workspace setup and owner approval.",
    createdByUserId: "workspace-test",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("/api/github/connection-status", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFindGitHubInstallationByWorkspace.mockReset();
    mockListRepoConnectionsByWorkspace.mockReset();
    mockFindGitHubInstallationByWorkspace.mockResolvedValue(null);
    mockListRepoConnectionsByWorkspace.mockResolvedValue([]);
  });

  it("returns disconnected when no installation is found", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/github/connection-status"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "disconnected" });
    expect(mockFindGitHubInstallationByWorkspace).toHaveBeenCalledWith("workspace-test");
    expect(mockListRepoConnectionsByWorkspace).not.toHaveBeenCalled();
  });

  it("returns installed when installation exists but no connected repo connection exists", async () => {
    mockFindGitHubInstallationByWorkspace.mockResolvedValue(makeInstallation());
    mockListRepoConnectionsByWorkspace.mockResolvedValue([makeRepoConnection({ status: "disconnected" })]);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/github/connection-status"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "installed", installationId: "12345" });
    expect(mockListRepoConnectionsByWorkspace).toHaveBeenCalledWith("workspace-test");
  });

  it("returns connected when installation and connected repo connection exist", async () => {
    const connection = makeRepoConnection();
    mockFindGitHubInstallationByWorkspace.mockResolvedValue(makeInstallation());
    mockListRepoConnectionsByWorkspace.mockResolvedValue([makeRepoConnection({ status: "disconnected" }), connection]);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/github/connection-status"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "connected", installationId: "12345", repoConnection: connection });
  });

  it("returns 503 on DB error", async () => {
    mockFindGitHubInstallationByWorkspace.mockRejectedValue(new Error("mongo unavailable"));
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/github/connection-status"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "GitHub connection status could not be loaded. Please try again." });
  });
});
