import { beforeEach, describe, expect, it, vi } from "vitest";

import { MockGitHubClient, type GitHubClient } from "./github-client";
import type { GateContext } from "./implementation-gates";
import type { ImplementationJob, RepoConnection, SignalGenRun } from "./types";

const mockFindImplementationJobById = vi.hoisted(() => vi.fn());
const mockUpdateImplementationJob = vi.hoisted(() => vi.fn());
const mockFindRunById = vi.hoisted(() => vi.fn());
const mockWriteAuditLog = vi.hoisted(() => vi.fn());

vi.mock("./implementation-job-db", () => ({
  findImplementationJobById: mockFindImplementationJobById,
  updateImplementationJob: mockUpdateImplementationJob,
}));

vi.mock("./signal-run-db", () => ({
  findRunById: mockFindRunById,
}));

vi.mock("./audit-log-db", () => ({
  writeAuditLog: mockWriteAuditLog,
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

function buildValidRun(overrides: Partial<SignalGenRun> = {}): SignalGenRun {
  return {
    _id: "run-1",
    source: "dashboard_upload",
    status: "approved",
    workspaceId: "ws-test",
    repoConnectionId: CONN_ID,
    screenshotNames: [],
    comments: [],
    createdAt: NOW,
    updatedAt: NOW,
    signal: {
      title: "Users are confused after upload",
      summary: "Feedback says the empty state is unclear.",
      confidence: 0.9,
      evidence: ["I don't know what to upload next"],
    },
    plan: {
      recommendedChange: "Add clear upload guidance.",
      filesToChange: ["src/app/page.tsx"],
      guardrails: ["Do not touch secrets, auth, billing, or database migrations."],
      acceptanceCriteria: ["Empty state explains the next upload step."],
    },
    founderDecision: {
      action: "approve",
      note: "Please make this clearer.",
      decidedAt: NOW,
      decidedBy: "user-approver",
    },
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

function makeThrowingClient(errorName: string): GitHubClient {
  return {
    createBranch: async () => {
      const error = new Error("transient detail that must not be returned");
      error.name = errorName;
      throw error;
    },
    createCommit: async () => ({ sha: "sha" }),
    openDraftPr: async () => ({ prUrl: "https://github.com/x/y/pull/1", prNumber: 1 }),
    getFileContents: async () => null,
    listFiles: async () => [],
  };
}

describe("executeImplementationJob", () => {
  let client: MockGitHubClient;

  beforeEach(() => {
    client = new MockGitHubClient();
    mockFindImplementationJobById.mockReset();
    mockUpdateImplementationJob.mockReset();
    mockFindRunById.mockReset();
    mockWriteAuditLog.mockReset();
    mockUpdateImplementationJob.mockResolvedValue(null);
    mockFindRunById.mockResolvedValue(buildValidRun());
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("returns error and makes no client calls when job is not found", async () => {
    mockFindImplementationJobById.mockResolvedValue(null);

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), client);

    expect(result).toEqual({ success: false, error: "Job not found" });
    expect(client.calls).toHaveLength(0);
    expect(mockUpdateImplementationJob).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
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

  it("blocks, writes gate_failed audit, and makes no client calls when workspace gate fails", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob());

    const result = await executeImplementationJob(JOB_ID, buildValidContext({ workspaceId: "wrong-ws" }), client);

    expect(result.success).toBe(false);
    expect(result.gateFailure).toEqual({ passed: false, gate: "WorkspaceMatch", reason: "Workspace mismatch" });
    expect(client.calls).toHaveLength(0);
    expect(mockUpdateImplementationJob).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({ status: "blocked" }),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "implementation_job.gate_failed" }));
  });

  it("blocks and makes no client calls when installation token is missing", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob());

    const result = await executeImplementationJob(JOB_ID, buildValidContext({ installationToken: null }), client);

    expect(result.success).toBe(false);
    expect(result.gateFailure).toMatchObject({ passed: false, gate: "InstallationToken" });
    expect(client.calls).toHaveLength(0);
  });

  it("blocks and makes no client calls when repo connection belongs to another workspace", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob());
    const conn = buildValidRepoConnection({ workspaceId: "other-ws" });

    const result = await executeImplementationJob(JOB_ID, buildValidContext({ repoConnection: conn }), client);

    expect(result.success).toBe(false);
    expect(result.gateFailure).toMatchObject({ passed: false, gate: "RepoConnectionWorkspace" });
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

  it("calls createCommit with generated changes, opens draft PR, marks succeeded, and persists codegen details", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob());
    const codegen = vi.fn(async () => ({
      status: "success" as const,
      summary: "Updated upload empty-state copy.",
      changes: [{ path: "src/app/page.tsx", content: "export default function Page() { return <main>Upload feedback</main>; }\n" }],
    }));

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), client, { codegen });

    expect(result.success).toBe(true);
    expect(codegen).toHaveBeenCalledWith(expect.objectContaining({
      plan: buildValidRun().plan,
      signal: buildValidRun().signal,
      githubClient: client,
      owner: "viviannnl",
      repo: "test-repo",
      baseRef: "main",
    }));
    expect(client.calls).toHaveLength(3);
    expect(client.calls[0]?.method).toBe("createBranch");
    expect(client.calls[1]?.method).toBe("createCommit");
    expect(client.calls[2]?.method).toBe("openDraftPr");
    expect(client.calls[1]?.params).toMatchObject({
      changes: [{ path: "src/app/page.tsx", content: "export default function Page() { return <main>Upload feedback</main>; }\n" }],
    });
    expect(JSON.stringify(client.calls[2]?.params)).toContain("Updated upload empty-state copy.");
    expect(JSON.stringify(client.calls[2]?.params)).toContain("src/app/page.tsx");

    const finalUpdate = mockUpdateImplementationJob.mock.calls.at(-1)?.[1];
    expect(finalUpdate?.status).toBe("succeeded");
    expect(finalUpdate?.prUrl).toContain("github.com");
    expect(finalUpdate?.changedFiles).toEqual(["src/app/page.tsx"]);
    expect(finalUpdate?.codegenSummary).toBe("Updated upload empty-state copy.");
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "implementation_job.succeeded" }));
  });

  it("marks requires_attention and skips commit/PR when codegen returns no_changes", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob());
    const codegen = vi.fn(async () => ({ status: "no_changes" as const, reason: "No valid changes remained after guardrail filtering." }));

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), client, { codegen });

    expect(result).toEqual({ success: false, error: "CodegenNoChanges: No valid changes remained after guardrail filtering." });
    expect(client.calls.map((call) => call.method)).toEqual(["createBranch"]);
    expect(mockUpdateImplementationJob).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({
        status: "requires_attention",
        errorClass: "CodegenNoChanges",
        errorMessage: "No valid changes remained after guardrail filtering.",
        logs: expect.arrayContaining(["Codegen requires attention: No valid changes remained after guardrail filtering."]),
      }),
    );
  });

  it("marks requires_attention and skips commit/PR when codegen fails", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob());
    const codegen = vi.fn(async () => ({ status: "failed" as const, reason: "GEMINI_API_KEY is not configured." }));

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), client, { codegen });

    expect(result).toEqual({ success: false, error: "CodegenFailed: GEMINI_API_KEY is not configured." });
    expect(client.calls.map((call) => call.method)).toEqual(["createBranch"]);
    expect(mockUpdateImplementationJob).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({
        status: "requires_attention",
        errorClass: "CodegenFailed",
        errorMessage: "GEMINI_API_KEY is not configured.",
      }),
    );
  });

  it("marks requires_attention and skips commit/PR when the run is missing", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob());
    mockFindRunById.mockResolvedValue(null);

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), client, {
      codegen: vi.fn(async () => ({ status: "success" as const, summary: "unused", changes: [{ path: "src/app/page.tsx", content: "unused" }] })),
    });

    expect(result).toEqual({ success: false, error: "CodegenFailed: Approved run or implementation plan was not found." });
    expect(client.calls.map((call) => call.method)).toEqual(["createBranch"]);
    expect(mockUpdateImplementationJob).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({
        status: "requires_attention",
        errorClass: "CodegenFailed",
        errorMessage: "Approved run or implementation plan was not found.",
      }),
    );
  });

  it("marks requires_attention and skips codegen when the run is not approved for this job", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob());
    mockFindRunById.mockResolvedValue(buildValidRun({ status: "plan_ready" }));
    const codegen = vi.fn(async () => ({ status: "success" as const, summary: "unused", changes: [{ path: "src/app/page.tsx", content: "unused" }] }));

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), client, { codegen });

    expect(result).toEqual({ success: false, error: "CodegenFailed: Approved run or implementation plan was not found." });
    expect(codegen).not.toHaveBeenCalled();
    expect(client.calls.map((call) => call.method)).toEqual(["createBranch"]);
  });

  it("marks requires_attention and skips codegen when the run belongs to another workspace or repo connection", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob());
    mockFindRunById.mockResolvedValue(buildValidRun({ workspaceId: "other-ws", repoConnectionId: "other-conn" }));
    const codegen = vi.fn(async () => ({ status: "success" as const, summary: "unused", changes: [{ path: "src/app/page.tsx", content: "unused" }] }));

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), client, { codegen });

    expect(result).toEqual({ success: false, error: "CodegenFailed: Approved run or implementation plan was not found." });
    expect(codegen).not.toHaveBeenCalled();
    expect(client.calls.map((call) => call.method)).toEqual(["createBranch"]);
  });

  it("sets status to failed and writes retry_scheduled audit for retry-eligible error under max attempts", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob({ attempts: 0 }));

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), makeThrowingClient("GitHubAPIError"));

    expect(result).toEqual({ success: false, error: "GitHubAPIError during execution attempt 1" });
    expect(mockUpdateImplementationJob).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({
        status: "failed",
        errorClass: "GitHubAPIError",
        errorMessage: "GitHubAPIError during execution attempt 1",
      }),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "implementation_job.retry_scheduled" }));
  });

  it("sets status to requires_attention and writes requires_attention audit for retry-eligible error at max attempts", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob({ attempts: 2 }));

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), makeThrowingClient("GitHubAPIError"));

    expect(result).toEqual({ success: false, error: "GitHubAPIError during execution attempt 3" });
    expect(mockUpdateImplementationJob).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({
        status: "requires_attention",
        errorClass: "GitHubAPIError",
        errorMessage: "GitHubAPIError during execution attempt 3",
      }),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "implementation_job.requires_attention" }));
  });

  it("sets status to requires_attention immediately for non-retry-eligible error", async () => {
    mockFindImplementationJobById.mockResolvedValue(buildValidJob({ attempts: 0 }));

    const result = await executeImplementationJob(JOB_ID, buildValidContext(), makeThrowingClient("UnexpectedGitHubClientError"));

    expect(result).toEqual({ success: false, error: "UnexpectedGitHubClientError during execution attempt 1" });
    expect(mockUpdateImplementationJob).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({
        status: "requires_attention",
        errorClass: "UnexpectedGitHubClientError",
        errorMessage: "UnexpectedGitHubClientError during execution attempt 1",
      }),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "implementation_job.requires_attention" }));
  });
});
