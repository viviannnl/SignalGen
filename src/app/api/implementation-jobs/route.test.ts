import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateImplementationJob = vi.hoisted(() => vi.fn());
const mockFindImplementationJobByIdempotencyKey = vi.hoisted(() => vi.fn());
const mockWriteAuditLog = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(),
}));

vi.mock("@/lib/implementation-job-db", () => ({
  createImplementationJob: mockCreateImplementationJob,
  findImplementationJobByIdempotencyKey: mockFindImplementationJobByIdempotencyKey,
}));

vi.mock("@/lib/audit-log-db", () => ({
  writeAuditLog: mockWriteAuditLog,
}));

vi.mock("@/lib/workspace", () => ({
  resolveWorkspaceId: () => "ws-test",
}));

const NOW = "2026-01-01T00:00:00.000Z";

function makeJobBody(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-1",
    repoConnectionId: "64f0c1f2a3b4c5d6e7f80902",
    approvedByUserId: "user-approver",
    ...overrides,
  };
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    _id: "64f0c1f2a3b4c5d6e7f80901",
    workspaceId: "ws-test",
    runId: "run-1",
    repoConnectionId: "64f0c1f2a3b4c5d6e7f80902",
    approvedByUserId: "user-approver",
    approvedAt: NOW,
    status: "queued",
    branchName: "signalgen/job-run-1",
    idempotencyKey: "ws-test:run-1",
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
    mockFindImplementationJobByIdempotencyKey.mockResolvedValue(null);
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("creates a new implementation job and returns 201", async () => {
    const job = makeJob();
    mockCreateImplementationJob.mockResolvedValue(job);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/implementation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeJobBody()),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.job._id).toBe("64f0c1f2a3b4c5d6e7f80901");
    expect(mockCreateImplementationJob).toHaveBeenCalledOnce();
  });

  it("returns 409 DuplicateJob when a non-cancelled job with the same deterministic workspace/run key exists", async () => {
    const existing = makeJob({ status: "queued" });
    mockFindImplementationJobByIdempotencyKey.mockResolvedValue(existing);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/implementation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeJobBody({ idempotencyKey: "attacker-controlled-key" })),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("DuplicateJob");
    expect(body.jobId).toBe("64f0c1f2a3b4c5d6e7f80901");
    expect(mockFindImplementationJobByIdempotencyKey).toHaveBeenCalledWith("ws-test:run-1", "ws-test");
    expect(mockCreateImplementationJob).not.toHaveBeenCalled();
  });

  it("allows creation when existing job is cancelled", async () => {
    const cancelled = makeJob({ status: "cancelled" });
    mockFindImplementationJobByIdempotencyKey.mockResolvedValue(cancelled);
    const newJob = makeJob({ _id: "64f0c1f2a3b4c5d6e7f80999" });
    mockCreateImplementationJob.mockResolvedValue(newJob);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/implementation-jobs", {
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
      new Request("http://localhost/api/implementation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: "run-1" }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
