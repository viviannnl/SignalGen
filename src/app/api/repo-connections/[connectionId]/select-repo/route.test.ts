import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RepoConnection } from "@/lib/types";

const mockFindRepoConnectionById = vi.hoisted(() => vi.fn());
const mockUpdateRepoConnection = vi.hoisted(() => vi.fn());
const mockFindGitHubInstallationByWorkspace = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(),
}));

vi.mock("@/lib/github-installation-db", () => ({
  findGitHubInstallationByWorkspace: mockFindGitHubInstallationByWorkspace,
}));

vi.mock("@/lib/repo-connection-db", () => ({
  findRepoConnectionById: mockFindRepoConnectionById,
  updateRepoConnection: mockUpdateRepoConnection,
}));

vi.mock("@/lib/workspace", () => ({
  resolveWorkspaceId: () => "workspace-test",
}));

const NOW = "2026-05-25T13:00:00.000Z";

function makeRepoConnection(overrides: Partial<RepoConnection> = {}): RepoConnection {
  return {
    _id: "connection-1",
    workspaceId: "workspace-test",
    provider: "github",
    owner: "viviannnl",
    repo: "ai-cover-letter",
    defaultBranch: "main",
    installationId: null,
    capabilities: {
      pr_creation: false,
      branch_push: false,
      issue_creation: false,
    },
    status: "disconnected",
    disabledReason: "GitHub App installation requires workspace setup and owner approval.",
    createdByUserId: "workspace-test",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

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

describe("/api/repo-connections/[connectionId]/select-repo", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    mockFindRepoConnectionById.mockReset();
    mockUpdateRepoConnection.mockReset();
    mockFindGitHubInstallationByWorkspace.mockReset();
    mockFindRepoConnectionById.mockResolvedValue(makeRepoConnection());
    mockFindGitHubInstallationByWorkspace.mockResolvedValue(makeInstallation());
    mockUpdateRepoConnection.mockResolvedValue(makeRepoConnection({
      owner: "viviannnl",
      repo: "SignalGen",
      defaultBranch: "main",
      installationId: "12345",
      status: "connected",
    }));
  });

  it("PATCH returns updated connection with status connected on success", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/repo-connections/connection-1/select-repo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: " viviannnl ", repo: " SignalGen ", defaultBranch: " main ", installationId: "client-supplied-value" }),
      }),
      { params: Promise.resolve({ connectionId: "connection-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.connection.status).toBe("connected");
    expect(mockUpdateRepoConnection).toHaveBeenCalledWith("connection-1", {
      owner: "viviannnl",
      repo: "SignalGen",
      defaultBranch: "main",
      installationId: "12345",
      status: "connected",
      updatedAt: NOW,
    });
  });

  it("PATCH returns 400 when required fields are missing", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/repo-connections/connection-1/select-repo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "viviannnl", repo: "SignalGen", defaultBranch: "main" }),
      }),
      { params: Promise.resolve({ connectionId: "connection-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "owner, repo, defaultBranch, and installationId are required" });
    expect(mockUpdateRepoConnection).not.toHaveBeenCalled();
  });

  it("PATCH returns 404 for cross-workspace connection", async () => {
    mockFindRepoConnectionById.mockResolvedValue(makeRepoConnection({ workspaceId: "other-workspace" }));
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/repo-connections/connection-1/select-repo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "viviannnl", repo: "SignalGen", defaultBranch: "main", installationId: "12345" }),
      }),
      { params: Promise.resolve({ connectionId: "connection-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Connection not found" });
    expect(mockUpdateRepoConnection).not.toHaveBeenCalled();
  });

  it("PATCH returns 404 when no active GitHub App installation exists for the workspace", async () => {
    mockFindGitHubInstallationByWorkspace.mockResolvedValue(null);
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/repo-connections/connection-1/select-repo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "viviannnl", repo: "SignalGen", defaultBranch: "main", installationId: "12345" }),
      }),
      { params: Promise.resolve({ connectionId: "connection-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "GitHub App installation not found" });
    expect(mockUpdateRepoConnection).not.toHaveBeenCalled();
  });

  it("updated connection has status connected", async () => {
    const updatedConnection = makeRepoConnection({ status: "connected", installationId: "12345" });
    mockUpdateRepoConnection.mockResolvedValue(updatedConnection);
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/repo-connections/connection-1/select-repo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "viviannnl", repo: "SignalGen", defaultBranch: "main", installationId: "12345" }),
      }),
      { params: Promise.resolve({ connectionId: "connection-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.connection).toMatchObject({ status: "connected", installationId: "12345" });
  });
});
