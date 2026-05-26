import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindImplementationJobById = vi.hoisted(() => vi.fn());
const mockFindRepoConnectionById = vi.hoisted(() => vi.fn());
const mockExecuteImplementationJob = vi.hoisted(() => vi.fn());
const mockCreateRealGitHubClientForInstallation = vi.hoisted(() => vi.fn());

vi.mock("@/lib/implementation-job-db", () => ({
  findImplementationJobById: mockFindImplementationJobById,
}));

vi.mock("@/lib/repo-connection-db", () => ({
  findRepoConnectionById: mockFindRepoConnectionById,
}));

vi.mock("@/lib/implementation-executor", () => ({
  executeImplementationJob: mockExecuteImplementationJob,
}));

vi.mock("@/lib/workspace", () => ({
  resolveWorkspaceId: () => "ws-test",
}));

vi.mock("@/lib/github-client", () => ({
  MockGitHubClient: class MockGitHubClient {},
  createRealGitHubClientForInstallation: mockCreateRealGitHubClientForInstallation,
}));

const JOB_ID = "64f0c1f2a3b4c5d6e7f80901";

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    _id: JOB_ID,
    workspaceId: "ws-test",
    repoConnectionId: "64f0c1f2a3b4c5d6e7f80902",
    ...overrides,
  };
}

function makeRepoConnection(overrides: Record<string, unknown> = {}) {
  return {
    _id: "64f0c1f2a3b4c5d6e7f80902",
    workspaceId: "ws-test",
    installationId: "install-123",
    ...overrides,
  };
}

describe("/api/implementation-jobs/[jobId]/run POST", () => {
  const previousFlag = process.env.SIGNALGEN_ENABLE_REAL_GITHUB_WRITES;

  beforeEach(() => {
    vi.resetModules();
    process.env.SIGNALGEN_ENABLE_REAL_GITHUB_WRITES = previousFlag;
    mockFindImplementationJobById.mockReset();
    mockFindRepoConnectionById.mockReset();
    mockExecuteImplementationJob.mockReset();
    mockCreateRealGitHubClientForInstallation.mockReset();
    mockFindImplementationJobById.mockResolvedValue(makeJob());
    mockFindRepoConnectionById.mockResolvedValue(makeRepoConnection());
    mockExecuteImplementationJob.mockResolvedValue({ success: true });
    mockCreateRealGitHubClientForInstallation.mockResolvedValue({ client: { kind: "real-client" }, installationTokenMarker: "present" });
  });

  it("uses mock execution by default and does not mint a real GitHub token", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request(`http://localhost/api/implementation-jobs/${JOB_ID}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestingUserId: "user-1" }),
      }),
      { params: Promise.resolve({ jobId: JOB_ID }) },
    );

    expect(response.status).toBe(200);
    expect(mockCreateRealGitHubClientForInstallation).not.toHaveBeenCalled();
    expect(mockExecuteImplementationJob.mock.calls[0]?.[1]).toMatchObject({ installationToken: null, requestingUserId: "user-1" });
  });

  it("blocks real GitHub execution unless the global write flag is explicitly enabled", async () => {
    process.env.SIGNALGEN_ENABLE_REAL_GITHUB_WRITES = "false";
    const { POST } = await import("./route");
    const response = await POST(
      new Request(`http://localhost/api/implementation-jobs/${JOB_ID}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionMode: "real_github" }),
      }),
      { params: Promise.resolve({ jobId: JOB_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Real GitHub writes are disabled");
    expect(mockCreateRealGitHubClientForInstallation).not.toHaveBeenCalled();
    expect(mockExecuteImplementationJob).not.toHaveBeenCalled();
  });

  it("blocks real GitHub execution before token minting when the repo connection workspace mismatches", async () => {
    process.env.SIGNALGEN_ENABLE_REAL_GITHUB_WRITES = "true";
    mockFindRepoConnectionById.mockResolvedValue(makeRepoConnection({ workspaceId: "other-ws" }));
    const { POST } = await import("./route");
    const response = await POST(
      new Request(`http://localhost/api/implementation-jobs/${JOB_ID}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionMode: "real_github" }),
      }),
      { params: Promise.resolve({ jobId: JOB_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Repo connection workspace mismatch");
    expect(mockCreateRealGitHubClientForInstallation).not.toHaveBeenCalled();
    expect(mockExecuteImplementationJob).not.toHaveBeenCalled();
  });

  it("mints an installation token marker and uses the real client only when real mode and global flag are enabled", async () => {
    process.env.SIGNALGEN_ENABLE_REAL_GITHUB_WRITES = "true";
    const { POST } = await import("./route");
    const response = await POST(
      new Request(`http://localhost/api/implementation-jobs/${JOB_ID}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionMode: "real_github", requestingUserId: "user-1" }),
      }),
      { params: Promise.resolve({ jobId: JOB_ID }) },
    );

    expect(response.status).toBe(200);
    expect(mockCreateRealGitHubClientForInstallation).toHaveBeenCalledWith("install-123");
    expect(mockExecuteImplementationJob.mock.calls[0]?.[1]).toMatchObject({ installationToken: "present", requestingUserId: "user-1" });
    expect(mockExecuteImplementationJob.mock.calls[0]?.[2]).toEqual({ kind: "real-client" });
  });
});
