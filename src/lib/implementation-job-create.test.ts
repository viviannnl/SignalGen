import { beforeEach, describe, expect, it, vi } from "vitest";

const RUN_ID = "64f0c1f2a3b4c5d6e7f80903";
const REPO_CONNECTION_ID = "64f0c1f2a3b4c5d6e7f80902";
const JOB_ID = "64f0c1f2a3b4c5d6e7f80901";

const mockCreateImplementationJob = vi.hoisted(() => vi.fn());
const mockFindImplementationJobByIdempotencyKey = vi.hoisted(() => vi.fn());
const mockWriteAuditLog = vi.hoisted(() => vi.fn());
const mockFindRepoConnectionById = vi.hoisted(() => vi.fn());

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

function makeRepoConnection(overrides: Record<string, unknown> = {}) {
  return {
    _id: REPO_CONNECTION_ID,
    workspaceId: "ws-test",
    status: "connected",
    ...overrides,
  };
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    _id: JOB_ID,
    workspaceId: "ws-test",
    runId: RUN_ID,
    repoConnectionId: REPO_CONNECTION_ID,
    approvedByUserId: "user-test",
    approvedAt: "2026-01-01T00:00:00.000Z",
    status: "queued",
    branchName: `signalgen/job-${RUN_ID}`,
    idempotencyKey: `ws-test:${RUN_ID}`,
    attempts: 0,
    logs: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function importSubject() {
  return import("./implementation-job-create");
}

describe("createImplementationJobForRun", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateImplementationJob.mockReset();
    mockFindImplementationJobByIdempotencyKey.mockReset();
    mockWriteAuditLog.mockReset();
    mockFindRepoConnectionById.mockReset();
    mockFindRepoConnectionById.mockResolvedValue(makeRepoConnection());
    mockFindImplementationJobByIdempotencyKey.mockResolvedValue(null);
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("creates one queued implementation job for a connected repo and writes a best-effort audit log", async () => {
    const job = makeJob();
    mockCreateImplementationJob.mockResolvedValue(job);
    const { createImplementationJobForRun } = await importSubject();

    const result = await createImplementationJobForRun({
      workspaceId: "ws-test",
      runId: RUN_ID,
      repoConnectionId: REPO_CONNECTION_ID,
      approvedByUserId: "user-test",
      signalId: "signal-1",
      planId: "plan-1",
    });

    expect(result.status).toBe("created");
    if (result.status !== "created") {
      throw new Error("expected created result");
    }
    expect(result.job).toBe(job);
    expect(mockFindRepoConnectionById).toHaveBeenCalledWith(REPO_CONNECTION_ID);
    expect(mockFindImplementationJobByIdempotencyKey).toHaveBeenCalledWith(`ws-test:${RUN_ID}`, "ws-test");
    expect(mockCreateImplementationJob).toHaveBeenCalledOnce();
    expect(mockCreateImplementationJob.mock.calls[0]?.[0]).toMatchObject({
      workspaceId: "ws-test",
      runId: RUN_ID,
      repoConnectionId: REPO_CONNECTION_ID,
      approvedByUserId: "user-test",
      branchName: `signalgen/job-${RUN_ID}`,
      signalId: "signal-1",
      planId: "plan-1",
      idempotencyKey: `ws-test:${RUN_ID}`,
      status: "queued",
      attempts: 0,
      logs: [],
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws-test",
      actorUserId: "user-test",
      action: "implementation_job.created",
      resourceType: "implementation_job",
      resourceId: JOB_ID,
      detail: { runId: RUN_ID, repoConnectionId: REPO_CONNECTION_ID, branchName: `signalgen/job-${RUN_ID}` },
    }));
  });

  it("returns a duplicate result instead of creating when a non-cancelled job already exists", async () => {
    const existing = makeJob({ status: "queued" });
    mockFindImplementationJobByIdempotencyKey.mockResolvedValue(existing);
    const { createImplementationJobForRun } = await importSubject();

    const result = await createImplementationJobForRun({
      workspaceId: "ws-test",
      runId: RUN_ID,
      repoConnectionId: REPO_CONNECTION_ID,
      approvedByUserId: "user-test",
    });

    expect(result.status).toBe("duplicate");
    if (result.status !== "duplicate") {
      throw new Error("expected duplicate result");
    }
    expect(result.job).toBe(existing);
    expect(mockCreateImplementationJob).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("returns repo_not_connected without creating a job when the repo connection is disconnected", async () => {
    mockFindRepoConnectionById.mockResolvedValue(makeRepoConnection({ status: "needs_reauth" }));
    const { createImplementationJobForRun } = await importSubject();

    const result = await createImplementationJobForRun({
      workspaceId: "ws-test",
      runId: RUN_ID,
      repoConnectionId: REPO_CONNECTION_ID,
      approvedByUserId: "user-test",
    });

    expect(result.status).toBe("repo_not_connected");
    if (result.status !== "repo_not_connected") {
      throw new Error("expected repo_not_connected result");
    }
    expect(result.error).toBe("Repo connection is not connected.");
    expect(mockCreateImplementationJob).not.toHaveBeenCalled();
  });
});
