import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const AUTH_HEADERS = {
  "x-signalgen-test-user-id": "user-test",
  "x-signalgen-test-workspace-id": "ws-test",
  "x-signalgen-test-role": "owner",
};

function authedRequest(input: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(AUTH_HEADERS)) {
    headers.set(key, value);
  }
  return new Request(input, { ...init, headers });
}

const RUN_ID = "64f0c1f2a3b4c5d6e7f80903";
const REPO_CONNECTION_ID = "64f0c1f2a3b4c5d6e7f80902";

const mockCreateImplementationJob = vi.hoisted(() => vi.fn());
const mockFindImplementationJobByIdempotencyKey = vi.hoisted(() => vi.fn());
const mockWriteAuditLog = vi.hoisted(() => vi.fn());
const mockFindOne = vi.hoisted(() => vi.fn());
const mockFindRepoConnectionById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn(() => ({ findOne: mockFindOne })),
  })),
}));

vi.mock("@/lib/implementation-job-db", () => ({
  createImplementationJob: mockCreateImplementationJob,
  findImplementationJobByIdempotencyKey: mockFindImplementationJobByIdempotencyKey,
}));

vi.mock("@/lib/repo-connection-db", () => ({
  findRepoConnectionById: mockFindRepoConnectionById,
}));

vi.mock("@/lib/audit-log-db", () => ({
  writeAuditLog: mockWriteAuditLog,
}));

vi.mock("@/lib/workspace", () => ({
  resolveWorkspaceId: () => "ws-test",
}));

const NOW = "2026-01-01T00:00:00.000Z";

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    _id: new ObjectId(RUN_ID),
    workspaceId: "ws-test",
    repoConnectionId: REPO_CONNECTION_ID,
    status: "approved",
    founderDecision: { action: "approve", note: "ship it", decidedAt: NOW, decidedBy: "user-test" },
    ...overrides,
  };
}

function makeRepoConnection(overrides: Record<string, unknown> = {}) {
  return {
    _id: REPO_CONNECTION_ID,
    workspaceId: "ws-test",
    status: "connected",
    ...overrides,
  };
}

function makeJobBody(overrides: Record<string, unknown> = {}) {
  return {
    runId: RUN_ID,
    repoConnectionId: REPO_CONNECTION_ID,
    approvedByUserId: "malicious-body-user",
    ...overrides,
  };
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    _id: "64f0c1f2a3b4c5d6e7f80901",
    workspaceId: "ws-test",
    runId: RUN_ID,
    repoConnectionId: REPO_CONNECTION_ID,
    approvedByUserId: "user-test",
    approvedAt: NOW,
    status: "queued",
    branchName: `signalgen/job-${RUN_ID}`,
    idempotencyKey: `ws-test:${RUN_ID}`,
    attempts: 0,
    logs: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("/api/implementation-jobs POST", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateImplementationJob.mockReset();
    mockFindImplementationJobByIdempotencyKey.mockReset();
    mockWriteAuditLog.mockReset();
    mockFindOne.mockReset();
    mockFindRepoConnectionById.mockReset();
    mockFindOne.mockResolvedValue(makeRun());
    mockFindRepoConnectionById.mockResolvedValue(makeRepoConnection());
    mockFindImplementationJobByIdempotencyKey.mockResolvedValue(null);
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("creates a new implementation job from an approved workspace/repo run and stamps the authenticated user", async () => {
    const job = makeJob();
    mockCreateImplementationJob.mockResolvedValue(job);

    const { POST } = await import("./route");
    const response = await POST(
      authedRequest("http://localhost/api/implementation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeJobBody()),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.job._id).toBe("64f0c1f2a3b4c5d6e7f80901");
    expect(mockFindOne).toHaveBeenCalledWith({ _id: new ObjectId(RUN_ID), workspaceId: "ws-test", repoConnectionId: REPO_CONNECTION_ID });
    expect(mockFindRepoConnectionById).toHaveBeenCalledWith(REPO_CONNECTION_ID);
    expect(mockCreateImplementationJob).toHaveBeenCalledOnce();
    expect(mockCreateImplementationJob.mock.calls[0]?.[0]).toMatchObject({ approvedByUserId: "user-test" });
  });

  it("rejects job creation when the referenced run is missing or outside the workspace/repo", async () => {
    mockFindOne.mockResolvedValue(null);

    const { POST } = await import("./route");
    const response = await POST(
      authedRequest("http://localhost/api/implementation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeJobBody()),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Run not found.");
    expect(mockCreateImplementationJob).not.toHaveBeenCalled();
  });

  it("rejects job creation when the referenced run is not founder-approved", async () => {
    mockFindOne.mockResolvedValue(makeRun({ status: "plan_ready", founderDecision: undefined }));

    const { POST } = await import("./route");
    const response = await POST(
      authedRequest("http://localhost/api/implementation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeJobBody()),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("Implementation requires founder approval.");
    expect(mockCreateImplementationJob).not.toHaveBeenCalled();
  });

  it("rejects job creation when the repo connection is missing, cross-workspace, or disconnected", async () => {
    mockFindRepoConnectionById.mockResolvedValue(makeRepoConnection({ workspaceId: "other-ws" }));

    const { POST } = await import("./route");
    const response = await POST(
      authedRequest("http://localhost/api/implementation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeJobBody()),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Repo connection not found.");
    expect(mockCreateImplementationJob).not.toHaveBeenCalled();
  });

  it("returns 409 DuplicateJob when a non-cancelled job with the same deterministic workspace/run key exists", async () => {
    const existing = makeJob({ status: "queued" });
    mockFindImplementationJobByIdempotencyKey.mockResolvedValue(existing);

    const { POST } = await import("./route");
    const response = await POST(
      authedRequest("http://localhost/api/implementation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeJobBody({ idempotencyKey: "attacker-controlled-key" })),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("DuplicateJob");
    expect(body.jobId).toBe("64f0c1f2a3b4c5d6e7f80901");
    expect(mockFindImplementationJobByIdempotencyKey).toHaveBeenCalledWith(`ws-test:${RUN_ID}`, "ws-test");
    expect(mockCreateImplementationJob).not.toHaveBeenCalled();
  });

  it("allows creation when existing job is cancelled", async () => {
    const cancelled = makeJob({ status: "cancelled" });
    mockFindImplementationJobByIdempotencyKey.mockResolvedValue(cancelled);
    const newJob = makeJob({ _id: "64f0c1f2a3b4c5d6e7f80999" });
    mockCreateImplementationJob.mockResolvedValue(newJob);

    const { POST } = await import("./route");
    const response = await POST(
      authedRequest("http://localhost/api/implementation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeJobBody()),
      }),
    );

    expect(response.status).toBe(201);
    expect(mockCreateImplementationJob).toHaveBeenCalledOnce();
  });

  it("returns 400 when required fields are missing", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      authedRequest("http://localhost/api/implementation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: RUN_ID }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockFindOne).not.toHaveBeenCalled();
  });
});
