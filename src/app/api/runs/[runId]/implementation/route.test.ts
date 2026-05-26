import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindOne = vi.fn();
const mockFindOneAndUpdate = vi.fn();

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn(() => ({ findOne: mockFindOne, findOneAndUpdate: mockFindOneAndUpdate })),
  })),
}));

vi.mock("@/lib/implementation-job", async () => import("../../../../../lib/implementation-job"));

const { POST } = await import("./route");

function makeRun() {
  return {
    _id: new ObjectId("64f0c1f2a3b4c5d6e7f80901"),
    workspaceId: "demo",
    repoConnectionId: "repo-123",
    source: "dashboard_upload",
    status: "approved",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    screenshotNames: [],
    comments: ["Please add Slack notifications."],
    signal: { title: "Slack notifications requested", summary: "Users asked for Slack alerts.", confidence: 0.9, evidence: [] },
    plan: { recommendedChange: "Add Slack notifications.", filesToChange: [], guardrails: [], acceptanceCriteria: [] },
    founderDecision: { action: "approve", decidedAt: "2026-01-01T00:00:00.000Z", decidedBy: "dashboard_founder" },
  };
}

function postImplementation(body: unknown = {}) {
  const runId = "64f0c1f2a3b4c5d6e7f80901";
  return POST(
    new Request(`http://localhost/api/runs/${runId}/implementation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ runId }) },
  );
}

describe("POST /api/runs/[runId]/implementation", () => {
  beforeEach(() => {
    mockFindOne.mockReset();
    mockFindOneAndUpdate.mockReset();
  });

  it("rejects implementation starts without the selected run repo", async () => {
    mockFindOne.mockResolvedValue(makeRun());

    const response = await postImplementation();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Choose the run's repo before starting implementation.");
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("uses workspace and repo scope in the atomic implementation update", async () => {
    const run = makeRun();
    mockFindOne.mockResolvedValue(run);
    mockFindOneAndUpdate.mockResolvedValue({ ...run, implementation: { status: "queued" } });

    const response = await postImplementation({ repoConnectionId: "repo-123" });

    expect(response.status).toBe(200);
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: run._id, workspaceId: "demo", repoConnectionId: "repo-123", status: "approved", implementation: { $exists: false } },
      expect.any(Object),
      { returnDocument: "after" },
    );
  });
});
