import { describe, expect, it } from "vitest";

import { checkAllGates, type GateContext } from "./implementation-gates";
import type { ImplementationJob, RepoConnection } from "./types";

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

describe("checkAllGates", () => {
  it("passes when all gates are satisfied", () => {
    const result = checkAllGates(buildValidJob(), buildValidContext());
    expect(result).toEqual({ passed: true });
  });

  it("fails WorkspaceMatch when job workspaceId does not match context", () => {
    const result = checkAllGates(buildValidJob({ workspaceId: "other-ws" }), buildValidContext());
    expect(result).toEqual({ passed: false, gate: "WorkspaceMatch", reason: "Workspace mismatch" });
  });

  it("fails RepoConnectionPresent when repoConnection is null", () => {
    const result = checkAllGates(buildValidJob(), buildValidContext({ repoConnection: null }));
    expect(result).toEqual({ passed: false, gate: "RepoConnectionPresent", reason: "No repo connection" });
  });

  it("fails RepoConnectionStatus when repoConnection status is not connected", () => {
    const conn = buildValidRepoConnection({ status: "disconnected" });
    const result = checkAllGates(buildValidJob(), buildValidContext({ repoConnection: conn }));
    expect(result).toEqual({ passed: false, gate: "RepoConnectionStatus", reason: "Repo connection is not connected" });
  });

  it("fails RepoConnectionMatch when repoConnection _id does not match job repoConnectionId", () => {
    const conn = buildValidRepoConnection({ _id: "64f0c1f2a3b4c5d6e7f80999" });
    const result = checkAllGates(buildValidJob(), buildValidContext({ repoConnection: conn }));
    expect(result).toEqual({ passed: false, gate: "RepoConnectionMatch", reason: "Repo connection ID mismatch" });
  });

  it("fails CapabilityEnabled when pr_creation is false", () => {
    const conn = buildValidRepoConnection({
      capabilities: { pr_creation: false, branch_push: true, issue_creation: false },
    });
    const result = checkAllGates(buildValidJob(), buildValidContext({ repoConnection: conn }));
    expect(result).toEqual({ passed: false, gate: "CapabilityEnabled", reason: "pr_creation capability is disabled" });
  });

  it("fails ExplicitApproval when approvedByUserId is empty string", () => {
    const result = checkAllGates(buildValidJob({ approvedByUserId: "" }), buildValidContext());
    expect(result).toEqual({ passed: false, gate: "ExplicitApproval", reason: "No explicit approval" });
  });

  it("fails ApproverMatch when requestingUserId does not match approvedByUserId", () => {
    const result = checkAllGates(buildValidJob(), buildValidContext({ requestingUserId: "other-user" }));
    expect(result).toEqual({ passed: false, gate: "ApproverMatch", reason: "Requester does not match approver" });
  });

  it("fails InstallationToken when installationToken is null", () => {
    const result = checkAllGates(buildValidJob(), buildValidContext({ installationToken: null }));
    expect(result).toEqual({ passed: false, gate: "InstallationToken", reason: "GitHub installation token not available" });
  });

  it("fails InstallationToken when installationToken is empty string", () => {
    const result = checkAllGates(buildValidJob(), buildValidContext({ installationToken: "" }));
    expect(result).toEqual({ passed: false, gate: "InstallationToken", reason: "GitHub installation token not available" });
  });

  it("WorkspaceMatch fires before RepoConnectionPresent when both would fail", () => {
    const result = checkAllGates(
      buildValidJob({ workspaceId: "bad-ws" }),
      buildValidContext({ repoConnection: null }),
    );
    expect(result).toEqual({ passed: false, gate: "WorkspaceMatch", reason: "Workspace mismatch" });
  });
});
