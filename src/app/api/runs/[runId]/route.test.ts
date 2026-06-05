import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const AUTH_HEADERS = {
  "x-signalgen-test-user-id": "user-test",
  "x-signalgen-test-workspace-id": "demo",
  "x-signalgen-test-role": "owner",
};

function authedRequest(input: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(AUTH_HEADERS)) {
    headers.set(key, value);
  }
  return new Request(input, { ...init, headers });
}

const mockFindOne = vi.fn();

const mockFindImplementationJobByIdempotencyKey = vi.fn();

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn(() => ({ findOne: mockFindOne })),
  })),
}));

vi.mock("@/lib/implementation-job-db", () => ({
  findImplementationJobByIdempotencyKey: mockFindImplementationJobByIdempotencyKey,
}));

vi.mock("@/lib/workspace", () => ({
  resolveRepoConnectionId: (request: Request) => new URL(request.url).searchParams.get("repoConnectionId") ?? undefined,
  resolveWorkspaceId: () => "demo",
}));

const { GET } = await import("./route");

function requestFor(runId = "64f0c1f2a3b4c5d6e7f80901", repoConnectionId?: string) {
  const url = repoConnectionId ? `http://localhost/api/runs/${runId}?repoConnectionId=${repoConnectionId}` : `http://localhost/api/runs/${runId}`;
  return GET(authedRequest(url), { params: Promise.resolve({ runId }) });
}

describe("GET /api/runs/[runId]", () => {
  beforeEach(() => {
    mockFindOne.mockReset();
    mockFindImplementationJobByIdempotencyKey.mockReset();
    mockFindImplementationJobByIdempotencyKey.mockResolvedValue(null);
  });

  it("rejects run detail reads without a selected repo", async () => {
    const response = await requestFor();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Choose a repo before loading this SignalGen run.");
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it("loads the run only from the selected repo", async () => {
    const _id = new ObjectId("64f0c1f2a3b4c5d6e7f80901");
    mockFindOne.mockResolvedValue({ _id, workspaceId: "demo", repoConnectionId: "repo-123", status: "uploaded" });

    const response = await requestFor(_id.toString(), "repo-123");

    expect(response.status).toBe(200);
    expect(mockFindOne).toHaveBeenCalledWith({ _id, repoConnectionId: "repo-123", workspaceId: "demo" });
  });

  it("attaches the latest implementation job observed for the run", async () => {
    const _id = new ObjectId("64f0c1f2a3b4c5d6e7f80901");
    mockFindOne.mockResolvedValue({ _id, workspaceId: "demo", repoConnectionId: "repo-123", status: "approved" });
    mockFindImplementationJobByIdempotencyKey.mockResolvedValue({
      _id: "job-1",
      workspaceId: "demo",
      runId: _id.toString(),
      repoConnectionId: "repo-123",
      status: "succeeded",
      branchName: "signalgen/job-1",
      commitSha: "abc123",
      prUrl: "https://github.com/viviannnl/SignalGen/pull/12",
      prNumber: 12,
    });

    const response = await requestFor(_id.toString(), "repo-123");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFindImplementationJobByIdempotencyKey).toHaveBeenCalledWith(`demo:${_id.toString()}`, "demo");
    expect(body.implementationJob).toMatchObject({ status: "succeeded", prNumber: 12, commitSha: "abc123" });
  });
  it("does not return workspace-less legacy runs under Clerk auth", async () => {
    const _id = new ObjectId("64f0c1f2a3b4c5d6e7f80901");
    mockFindOne.mockResolvedValue(null);

    const response = await requestFor(_id.toString(), "repo-123");
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Run not found.");
    expect(mockFindOne).toHaveBeenCalledWith({ _id, repoConnectionId: "repo-123", workspaceId: "demo" });
  });
});
