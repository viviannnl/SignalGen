import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindOne = vi.fn();

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn(() => ({ findOne: mockFindOne })),
  })),
}));

vi.mock("@/lib/workspace", () => ({
  resolveRepoConnectionId: (request: Request) => new URL(request.url).searchParams.get("repoConnectionId") ?? undefined,
  resolveWorkspaceId: () => "demo",
}));

const { GET } = await import("./route");

function requestFor(runId = "64f0c1f2a3b4c5d6e7f80901", repoConnectionId?: string) {
  const url = repoConnectionId ? `http://localhost/api/runs/${runId}?repoConnectionId=${repoConnectionId}` : `http://localhost/api/runs/${runId}`;
  return GET(new Request(url), { params: Promise.resolve({ runId }) });
}

describe("GET /api/runs/[runId]", () => {
  beforeEach(() => {
    mockFindOne.mockReset();
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
    expect(mockFindOne).toHaveBeenCalledWith({ _id, repoConnectionId: "repo-123" });
  });
});
