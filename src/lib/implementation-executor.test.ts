import { beforeEach, describe, expect, it, vi } from "vitest";

import { MockGitHubClient } from "./github-client";
import type { GateContext } from "./implementation-gates";
import type { ImplementationJob, RepoConnection } from "./types";

const mockFindImplementationJobById = vi.hoisted(() => vi.fn());
const mockUpdateImplementationJob = vi.hoisted(() => vi.fn());

vi.mock("./implementation-job-db", () => ({
  findImplementationJobById: mockFindImplementationJobById,
  updateImplementationJob: mockUpdateImplementationJob,
}));

const { executeImplementationJob } = await import("./implementation-executor");

const CONN_ID = "64f0c1f2a3b4c5d6e7f80902";
const JOB_ID = "64f0c1f2a3b4c5d6e7f80901";
const NOW = "2026-01-01T00:00:00.000Z";

function buildValidRepoConnection(overrides: Partial<RepoConnection> = {}): RepoConnection {
  return {
    _id: CONN_ID,
    workspaceId: "ws-test",
    provider: "github",
    owner: "viviannnl",
    repo: "test-repo",
    defaultBranch: "main",
    installationId: "install-123",
    capabilities: {
      pr_creation: true,
      branch_push: true,
      issue_creation: false,
    },
    status: "connected",
    createdByUserId: "user-approver",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildValidJob(overrides: Partial<ImplementationJob> = {}): ImplementationJob {
  return {
    _id: JOB_ID,
    workspaceId: "ws-test",
    runId: "run-1",
    repoConnectionId: CONN_ID,
    status: "queued",
    branchName: "signalgen/feature-test",
    idempotencyKey: "ws-test:run-1",
    approvedByUserId: "user-approver",
    approvedAt: NOW,
    attempts: 0,
    logs: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildValidContext(overrides: Partial<GateContext> = {}): GateContext {
  return {
    workspaceId: "ws-test",
    repoConnection: buildValidRepoConnection(),
    installationToken: "mock-token-present",
    requestingUserId: "user-approver",
    ...overrides,
  };
}

describe("executeImplementationJob", () => {
  let client: MockGitHubClient;

  beforeEach(() => {
    client = new MockGitHubClient();
    mockFindImplementationJobById.mockReset();
    mockUpdateImplementationJob.mockReset();
    mockUpdateImplementationJob.mockResolvedValue(null);
  });

  it("returns error and makes no client calls when job is not found", async () => {
    mockFindImplementationJobById.mockResolvedValue(null);

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), client);

    expect(result).toEqual({ success: false, error: "Job not found" });
    expect(client.calls).toHaveLength(0);
    expect(mockUpdateImplementationJob).not.toHaveBeenCalled();
  });

  it("returns idempotency result and makes no client calls when job is already succeeded", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob({ status: "succeeded" }));

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), client);

    expect(result).toEqual({ success: false, error: "Job is already succeeded" });
    expect(client.calls).toHaveLength(0);
    expect(mockUpdateImplementationJob).not.toHaveBeenCalled();
  });

  it("returns idempotency result and makes no client calls when job is already cancelled", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob({ status: "cancelled" }));

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), client);

    expect(result).toEqual({ success: false, error: "Job is already cancelled" });
    expect(client.calls).toHaveLength(0);
    expect(mockUpdateImplementationJob).not.toHaveBeenCalled();
  });

  it("blocks and makes no client calls when workspace gate fails", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob());

    const result = await executeImplementationJob(JOB_ID, buildValidContext({ workspaceId: "wrong-ws" }), client);

    expect(result.success).toBe(false);
    expect(result.gateFailure).toEqual({ passed: false, gate: "WorkspaceMatch", reason: "Workspace mismatch" });
    expect(client.calls).toHaveLength(0);
    expect(mockUpdateImplementationJob).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({ status: "blocked" }),
    );
  });

  it("blocks and makes no client calls when installation token is missing", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob());

    const result = await executeImplementationJob(JOB_ID, buildValidContext({ installationToken: null }), client);

    expect(result.success).toBe(false);
    expect(result.gateFailure).toMatchObject({ passed: false, gate: "InstallationToken" });
    expect(client.calls).toHaveLength(0);
  });

  it("blocks and makes no client calls when pr_creation capability is disabled", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob());
    const conn = buildValidRepoConnection({
      capabilities: { pr_creation: false, branch_push: true, issue_creation: false },
    });

    const result = await executeImplementationJob(JOB_ID, buildValidContext({ repoConnection: conn }), client);

    expect(result.success).toBe(false);
    expect(result.gateFailure).toMatchObject({ passed: false, gate: "CapabilityEnabled" });
    expect(client.calls).toHaveLength(0);
  });

  it("calls createBranch, createCommit, openDraftPr and marks succeeded when all gates pass", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob());

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), client);

    expect(result.success).toBe(true);
    expect(client.calls).toHaveLength(3);
    expect(client.calls[0]?.method).toBe("createBranch");
    expect(client.calls[1]?.method).toBe("createCommit");
    expect(client.calls[2]?.method).toBe("openDraftPr");

    const finalUpdate = mockUpdateImplementationJob.mock.calls.at(-1)?.[1];
    expect(finalUpdate?.status).toBe("succeeded");
    expect(finalUpdate?.prUrl).toContain("github.com");
  });
});
