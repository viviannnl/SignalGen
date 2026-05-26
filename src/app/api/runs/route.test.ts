import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertOne = vi.hoisted(() => vi.fn());
const mockRunsFind = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn((name: string) => {
      if (name !== "runs") throw new Error(`Unexpected collection ${name}`);
      return { insertOne: mockInsertOne, find: mockRunsFind };
    }),
  })),
}));

vi.mock("@/lib/gemini-extraction", () => ({
  extractCommentsFromScreenshots: vi.fn(),
  RunCreationError: class RunCreationError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  validateScreenshotFile: vi.fn(() => null),
  validateTotalUploadSize: vi.fn(() => null),
}));

vi.mock("@/lib/demo-run", () => ({
  buildPendingRun: (screenshotNames: string[], comments: string[], extractionDiagnostics?: unknown) => ({
    source: "dashboard_upload",
    status: "uploaded",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    extractionDiagnostics,
    screenshotNames,
    comments,
    signal: { title: "Pending feedback upload", summary: "Pending", confidence: 0, evidence: [] },
    plan: { recommendedChange: "Pending", filesToChange: [], guardrails: [], acceptanceCriteria: [] },
  }),
  buildDemoRun: (screenshotNames: string[]) => ({
    source: "dashboard_upload",
    status: "uploaded",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    screenshotNames,
    comments: ["Sample feedback"],
    signal: { title: "Pending feedback upload", summary: "Pending", confidence: 0, evidence: [] },
    plan: { recommendedChange: "Pending", filesToChange: [], guardrails: [], acceptanceCriteria: [] },
  }),
}));

vi.mock("@/lib/repo-connection-db", () => ({
  findRepoConnectionById: vi.fn(async (id: string) => ({
    _id: id,
    workspaceId: "ws-test",
    status: "connected",
  })),
}));

vi.mock("@/lib/workspace", () => ({
  resolveWorkspaceId: () => "ws-test",
  buildWorkspaceFilter: (workspaceId: string) => ({ workspaceId }),
  resolveRepoConnectionId: (request: Request) => new URL(request.url).searchParams.get("repoConnectionId") ?? undefined,
  buildWorkspaceRepoFilter: (workspaceId: string, repoConnectionId?: string) => ({
    workspaceId,
    ...(repoConnectionId ? { repoConnectionId } : {}),
  }),
}));

const { GET, POST } = await import("./route");

function mockFindToArray(docs: unknown[]) {
  const toArray = vi.fn(async () => docs);
  const limit = vi.fn(() => ({ toArray }));
  const sort = vi.fn(() => ({ limit }));
  mockRunsFind.mockReturnValue({ sort });
  return { sort, limit, toArray };
}

describe("/api/runs", () => {
  beforeEach(() => {
    mockInsertOne.mockReset();
    mockRunsFind.mockReset();
    mockInsertOne.mockResolvedValue({ insertedId: new ObjectId("64f0c1f2a3b4c5d6e7f80901") });
  });

  it("rejects run creation without an explicit repoConnectionId", async () => {
    const response = await POST(
      new Request("http://localhost/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments: ["Please fix onboarding"] }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Choose a repo before creating a SignalGen run.");
    expect(mockInsertOne).not.toHaveBeenCalled();
  });

  it("stamps created runs with the selected repoConnectionId", async () => {
    const response = await POST(
      new Request("http://localhost/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoConnectionId: "repo-123", comments: ["Please fix onboarding"] }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.run.repoConnectionId).toBe("repo-123");
    expect(mockInsertOne).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws-test", repoConnectionId: "repo-123" }));
  });

  it("filters listed runs to the selected repoConnectionId", async () => {
    mockFindToArray([]);

    const response = await GET(new Request("http://localhost/api/runs?repoConnectionId=repo-123"));

    expect(response.status).toBe(200);
    expect(mockRunsFind).toHaveBeenCalledWith(expect.objectContaining({ repoConnectionId: "repo-123" }));
  });
});
