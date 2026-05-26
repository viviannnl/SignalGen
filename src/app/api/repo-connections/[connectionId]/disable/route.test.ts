import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RepoConnection } from "@/lib/types";

const mockFindRepoConnectionById = vi.hoisted(() => vi.fn());
const mockUpdateRepoConnection = vi.hoisted(() => vi.fn());
const mockWriteAuditLog = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(),
}));

vi.mock("@/lib/repo-connection-db", () => ({
  findRepoConnectionById: mockFindRepoConnectionById,
  updateRepoConnection: mockUpdateRepoConnection,
}));

vi.mock("@/lib/audit-log-db", () => ({
  writeAuditLog: mockWriteAuditLog,
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
    repo: "SignalGen",
    defaultBranch: "main",
    installationId: "12345",
    capabilities: {
      pr_creation: false,
      branch_push: false,
      issue_creation: false,
    },
    status: "connected",
    createdByUserId: "workspace-test",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("/api/repo-connections/[connectionId]/disable", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    mockFindRepoConnectionById.mockReset();
    mockUpdateRepoConnection.mockReset();
    mockWriteAuditLog.mockReset();
    mockFindRepoConnectionById.mockResolvedValue(makeRepoConnection());
    mockUpdateRepoConnection.mockResolvedValue(
      makeRepoConnection({
        status: "error",
        capabilities: { pr_creation: false, branch_push: false, issue_creation: false },
        disabledReason: "Disabled for incident response",
      }),
    );
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("POST returns 404 for an unknown connectionId", async () => {
    mockFindRepoConnectionById.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/repo-connections/unknown/disable", { method: "POST" }), {
      params: Promise.resolve({ connectionId: "unknown" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Connection not found" });
    expect(mockUpdateRepoConnection).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("POST returns 404 for a connection from another workspace", async () => {
    mockFindRepoConnectionById.mockResolvedValue(makeRepoConnection({ workspaceId: "other-workspace" }));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/repo-connections/connection-1/disable", { method: "POST" }), {
      params: Promise.resolve({ connectionId: "connection-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Connection not found" });
    expect(mockUpdateRepoConnection).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("POST disables the connection and writes an audit log", async () => {
    const updated = makeRepoConnection({
      status: "error",
      capabilities: { pr_creation: false, branch_push: false, issue_creation: false },
      disabledReason: "Disabled for incident response",
      updatedAt: NOW,
    });
    mockUpdateRepoConnection.mockResolvedValue(updated);
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/repo-connections/connection-1/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabledReason: " Disabled for incident response " }),
      }),
      { params: Promise.resolve({ connectionId: "connection-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.connection).toMatchObject({
      status: "error",
      capabilities: { pr_creation: false, branch_push: false, issue_creation: false },
      disabledReason: "Disabled for incident response",
    });
    expect(mockUpdateRepoConnection).toHaveBeenCalledWith("connection-1", {
      status: "error",
      capabilities: { pr_creation: false, branch_push: false, issue_creation: false },
      disabledReason: "Disabled for incident response",
      updatedAt: NOW,
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "repo_connection.disabled" }));
  });

  it("POST redacts secret-like disabled reasons before persistence and audit", async () => {
    const redacted = makeRepoConnection({
      status: "error",
      disabledReason: "Disabled by workspace admin",
      updatedAt: NOW,
    });
    mockUpdateRepoConnection.mockResolvedValue(redacted);
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/repo-connections/connection-1/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabledReason: `token ${"ghp"}_sensitivevalue` }),
      }),
      { params: Promise.resolve({ connectionId: "connection-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mockUpdateRepoConnection).toHaveBeenCalledWith(
      "connection-1",
      expect.objectContaining({ disabledReason: "Disabled by workspace admin" }),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { reason: "Disabled by workspace admin" } }),
    );
  });

  it("POST returns 404 when updateRepoConnection returns null", async () => {
    mockUpdateRepoConnection.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/repo-connections/connection-1/disable", { method: "POST" }), {
      params: Promise.resolve({ connectionId: "connection-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Connection not found" });
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("POST returns a safe 503 when persistence throws", async () => {
    mockFindRepoConnectionById.mockRejectedValue(new Error("mongo unavailable with sensitive details"));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/repo-connections/connection-1/disable", { method: "POST" }), {
      params: Promise.resolve({ connectionId: "connection-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "Repo connection could not be disabled. Please try again." });
  });
});
