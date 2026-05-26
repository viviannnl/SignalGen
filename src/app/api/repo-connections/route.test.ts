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

const mockCreateRepoConnection = vi.hoisted(() => vi.fn());
const mockListRepoConnectionsByWorkspace = vi.hoisted(() => vi.fn());
const mockFindRepoConnectionById = vi.hoisted(() => vi.fn());
const mockUpdateRepoConnection = vi.hoisted(() => vi.fn());
const mockWriteAuditLog = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(),
}));

vi.mock("@/lib/repo-connection-db", () => ({
  createRepoConnection: mockCreateRepoConnection,
  listRepoConnectionsByWorkspace: mockListRepoConnectionsByWorkspace,
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

describe("/api/repo-connections", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateRepoConnection.mockReset();
    mockListRepoConnectionsByWorkspace.mockReset();
    mockFindRepoConnectionById.mockReset();
    mockUpdateRepoConnection.mockReset();
    mockWriteAuditLog.mockReset();
    mockListRepoConnectionsByWorkspace.mockResolvedValue([]);
    mockFindRepoConnectionById.mockResolvedValue(null);
    mockUpdateRepoConnection.mockResolvedValue(null);
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("GET /api/repo-connections returns 200 with persisted workspace connections", async () => {
    const connection = makeRepoConnection();
    mockListRepoConnectionsByWorkspace.mockResolvedValue([connection]);
    const { GET } = await import("./route");

    const response = await GET(authedRequest("http://localhost/api/repo-connections"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ connections: [connection] });
    expect(mockListRepoConnectionsByWorkspace).toHaveBeenCalledWith("workspace-test");
  });

  it("GET /api/repo-connections returns a safe 503 when persistence is unavailable", async () => {
    mockListRepoConnectionsByWorkspace.mockRejectedValue(new Error("mongo unavailable"));
    const { GET } = await import("./route");

    const response = await GET(authedRequest("http://localhost/api/repo-connections"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "Repo connections could not be loaded. Please try again." });
  });

  it("POST /api/repo-connections with valid owner/repo returns a disabled persisted connection", async () => {
    const connection = makeRepoConnection();
    mockCreateRepoConnection.mockResolvedValue(connection);
    const { POST } = await import("./route");

    const response = await POST(
      authedRequest("http://localhost/api/repo-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: " viviannnl ", repo: " ai-cover-letter " }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.connection).toEqual(connection);
    expect(mockCreateRepoConnection).toHaveBeenCalledOnce();
    expect(mockCreateRepoConnection.mock.calls[0][0]).toMatchObject({
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
      createdByUserId: "workspace-test",
    });
    expect(mockCreateRepoConnection.mock.calls[0][0]._id).toBeUndefined();
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "repo_connection.created" }));
  });

  it("POST /api/repo-connections returns a safe 503 when persistence is unavailable", async () => {
    mockCreateRepoConnection.mockRejectedValue(new Error("mongo unavailable"));
    const { POST } = await import("./route");

    const response = await POST(
      authedRequest("http://localhost/api/repo-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "viviannnl", repo: "ai-cover-letter" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "Repo connection could not be saved. Please try again." });
  });

  it("POST /api/repo-connections with missing owner returns 400", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      authedRequest("http://localhost/api/repo-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: "ai-cover-letter" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("owner is required");
    expect(mockCreateRepoConnection).not.toHaveBeenCalled();
  });

  it("POST /api/repo-connections with missing repo returns 400", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      authedRequest("http://localhost/api/repo-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "viviannnl" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("repo is required");
    expect(mockCreateRepoConnection).not.toHaveBeenCalled();
  });

  it("GET /api/repo-connections/[connectionId] returns 404 for unknown connection", async () => {
    const { GET } = await import("./[connectionId]/route");

    const response = await GET(authedRequest("http://localhost/api/repo-connections/unknown"), {
      params: Promise.resolve({ connectionId: "unknown" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Connection not found" });
    expect(mockFindRepoConnectionById).toHaveBeenCalledWith("unknown");
  });

  it("GET /api/repo-connections/[connectionId] returns a persisted connection", async () => {
    const connection = makeRepoConnection();
    mockFindRepoConnectionById.mockResolvedValue(connection);
    const { GET } = await import("./[connectionId]/route");

    const response = await GET(authedRequest("http://localhost/api/repo-connections/connection-1"), {
      params: Promise.resolve({ connectionId: "connection-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ connection });
    expect(mockFindRepoConnectionById).toHaveBeenCalledWith("connection-1");
  });

  it("GET /api/repo-connections/[connectionId] returns 404 for a different workspace connection", async () => {
    mockFindRepoConnectionById.mockResolvedValue(makeRepoConnection({ workspaceId: "other-workspace" }));
    const { GET } = await import("./[connectionId]/route");

    const response = await GET(authedRequest("http://localhost/api/repo-connections/connection-1"), {
      params: Promise.resolve({ connectionId: "connection-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Connection not found" });
  });

  it("GET /api/repo-connections/[connectionId] returns a safe 503 when persistence is unavailable", async () => {
    mockFindRepoConnectionById.mockRejectedValue(new Error("mongo unavailable"));
    const { GET } = await import("./[connectionId]/route");

    const response = await GET(authedRequest("http://localhost/api/repo-connections/connection-1"), {
      params: Promise.resolve({ connectionId: "connection-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "Repo connection could not be loaded. Please try again." });
  });

  it("PATCH /api/repo-connections/[connectionId] updates provided fields and returns updated connection", async () => {
    const existing = makeRepoConnection();
    const updated = makeRepoConnection({ owner: "viviannnl", repo: "SignalGen", defaultBranch: "develop" });
    mockFindRepoConnectionById.mockResolvedValue(existing);
    mockUpdateRepoConnection.mockResolvedValue(updated);
    const { PATCH } = await import("./[connectionId]/route");

    const response = await PATCH(
      authedRequest("http://localhost/api/repo-connections/connection-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: " viviannnl ", repo: " SignalGen ", defaultBranch: " develop " }),
      }),
      { params: Promise.resolve({ connectionId: "connection-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ connection: updated });
    expect(mockUpdateRepoConnection).toHaveBeenCalledOnce();
    expect(mockUpdateRepoConnection.mock.calls[0][0]).toBe("connection-1");
    expect(mockUpdateRepoConnection.mock.calls[0][1]).toMatchObject({
      owner: "viviannnl",
      repo: "SignalGen",
      defaultBranch: "develop",
    });
    expect(typeof mockUpdateRepoConnection.mock.calls[0][1].updatedAt).toBe("string");
  });

  it("PATCH /api/repo-connections/[connectionId] returns 404 for cross-workspace connection", async () => {
    mockFindRepoConnectionById.mockResolvedValue(makeRepoConnection({ workspaceId: "other-workspace" }));
    const { PATCH } = await import("./[connectionId]/route");

    const response = await PATCH(
      authedRequest("http://localhost/api/repo-connections/connection-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "viviannnl" }),
      }),
      { params: Promise.resolve({ connectionId: "connection-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Connection not found" });
    expect(mockUpdateRepoConnection).not.toHaveBeenCalled();
  });

  it("PATCH /api/repo-connections/[connectionId] returns 404 for unknown connectionId", async () => {
    mockFindRepoConnectionById.mockResolvedValue(null);
    const { PATCH } = await import("./[connectionId]/route");

    const response = await PATCH(
      authedRequest("http://localhost/api/repo-connections/unknown", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: "SignalGen" }),
      }),
      { params: Promise.resolve({ connectionId: "unknown" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Connection not found" });
    expect(mockUpdateRepoConnection).not.toHaveBeenCalled();
  });
});
