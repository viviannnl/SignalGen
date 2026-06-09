import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RepoConnection } from "@/lib/types";

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

const mockFindRepoConnectionById = vi.hoisted(() => vi.fn());
const mockUpdateRepoConnection = vi.hoisted(() => vi.fn());
const mockFindGitHubInstallationByWorkspace = vi.hoisted(() => vi.fn());
const mockWriteAuditLog = vi.hoisted(() => vi.fn());
const mockGetInstallationPermissions = vi.hoisted(() => vi.fn());

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

vi.mock("@/lib/audit-log-db", () => ({
  writeAuditLog: mockWriteAuditLog,
}));

vi.mock("@/lib/github-client", () => ({
  getInstallationPermissions: mockGetInstallationPermissions,
  capabilitiesFromInstallationPermissions: (permissions: Record<string, string | undefined>) => ({
    pr_creation: permissions.pull_requests === "write" && permissions.contents === "write",
    branch_push: permissions.contents === "write",
    issue_creation: permissions.issues === "write",
  }),
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
    mockWriteAuditLog.mockReset();
    mockGetInstallationPermissions.mockReset();
    mockFindRepoConnectionById.mockResolvedValue(makeRepoConnection());
    mockFindGitHubInstallationByWorkspace.mockResolvedValue(makeInstallation());
    mockWriteAuditLog.mockResolvedValue(undefined);
    mockGetInstallationPermissions.mockResolvedValue({ contents: "read", pull_requests: "read" });
    mockUpdateRepoConnection.mockResolvedValue(makeRepoConnection({
      owner: "viviannnl",
      repo: "SignalGen",
      defaultBranch: "main",
      installationId: "12345",
      status: "connected",
      disabledReason: "GitHub App write permission could not be verified for PR creation.",
    }));
  });

  it("PATCH returns updated connection with status connected on success", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(
      authedRequest("http://localhost/api/repo-connections/connection-1/select-repo", {
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
      capabilities: {
        pr_creation: false,
        branch_push: false,
        issue_creation: false,
      },
      disabledReason: "GitHub App write permission could not be verified for PR creation.",
      updatedAt: NOW,
    });
  });

  it("PATCH enables PR and branch capabilities when installation permissions verify writes", async () => {
    mockGetInstallationPermissions.mockResolvedValue({ contents: "write", pull_requests: "write", issues: "read" });
    mockUpdateRepoConnection.mockImplementation(async (_id, update) => makeRepoConnection({
      owner: update.owner,
      repo: update.repo,
      defaultBranch: update.defaultBranch,
      installationId: update.installationId,
      status: update.status,
      capabilities: update.capabilities,
      disabledReason: update.disabledReason,
      updatedAt: update.updatedAt,
    }));
    const { PATCH } = await import("./route");

    const response = await PATCH(
      authedRequest("http://localhost/api/repo-connections/connection-1/select-repo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "viviannnl", repo: "SignalGen", defaultBranch: "main", installationId: "client-supplied-value" }),
      }),
      { params: Promise.resolve({ connectionId: "connection-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetInstallationPermissions).toHaveBeenCalledWith("12345");
    expect(body.connection.capabilities).toEqual({ pr_creation: true, branch_push: true, issue_creation: false });
    expect(body.connection.disabledReason).toBeUndefined();
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ capabilities: { pr_creation: true, branch_push: true, issue_creation: false } }),
    }));
  });

  it("PATCH still connects with disabled capabilities when permission verification fails", async () => {
    const verificationError = new Error("GitHub API request failed with status 403");
    verificationError.name = "GitHubRateLimited";
    mockGetInstallationPermissions.mockRejectedValue(verificationError);
    mockUpdateRepoConnection.mockImplementation(async (_id, update) => makeRepoConnection({
      owner: update.owner,
      repo: update.repo,
      defaultBranch: update.defaultBranch,
      installationId: update.installationId,
      status: update.status,
      capabilities: update.capabilities,
      disabledReason: update.disabledReason,
      updatedAt: update.updatedAt,
    }));
    const { PATCH } = await import("./route");

    const response = await PATCH(
      authedRequest("http://localhost/api/repo-connections/connection-1/select-repo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "viviannnl", repo: "SignalGen", defaultBranch: "main", installationId: "12345" }),
      }),
      { params: Promise.resolve({ connectionId: "connection-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.connection.status).toBe("connected");
    expect(body.connection.capabilities.pr_creation).toBe(false);
    expect(body.connection.disabledReason).toBe("GitHub App write permission could not be verified for PR creation.");
  });

  it("PATCH returns 400 when required fields are missing", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(
      authedRequest("http://localhost/api/repo-connections/connection-1/select-repo", {
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
      authedRequest("http://localhost/api/repo-connections/connection-1/select-repo", {
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
      authedRequest("http://localhost/api/repo-connections/connection-1/select-repo", {
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
      authedRequest("http://localhost/api/repo-connections/connection-1/select-repo", {
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
