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

const mocks = vi.hoisted(() => ({
  runsFindOne: vi.fn(),
  runsFindOneAndUpdate: vi.fn(),
  signalsFind: vi.fn(),
  signalsUpdateMany: vi.fn(),
  plansUpdateMany: vi.fn(),
  withTransaction: vi.fn(),
  endSession: vi.fn(),
  createImplementationJobForRun: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({
  getSignalGenClient: vi.fn(async () => ({
    startSession: vi.fn(() => ({
      withTransaction: mocks.withTransaction,
      endSession: mocks.endSession,
    })),
  })),
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn((name: string) => {
      if (name === "runs") {
        return {
          findOne: mocks.runsFindOne,
          findOneAndUpdate: mocks.runsFindOneAndUpdate,
        };
      }
      if (name === "signals") {
        return {
          find: mocks.signalsFind,
          updateMany: mocks.signalsUpdateMany,
        };
      }
      if (name === "plans") {
        return {
          updateMany: mocks.plansUpdateMany,
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
  })),
}));

vi.mock("@/lib/founder-decision", () => {
  class FounderDecisionError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  }

  return {
    FounderDecisionError,
    applyFounderDecision: vi.fn((_run: unknown, input: { action: "approve" | "reject"; note?: string; decidedBy: string }) => ({
      status: input.action === "approve" ? "approved" : "rejected",
      updatedAt: "2026-06-01T12:00:00.000Z",
      founderDecision: {
        action: input.action,
        note: input.note ?? "",
        decidedAt: "2026-06-01T12:00:00.000Z",
        decidedBy: input.decidedBy,
      },
    })),
  };
});

vi.mock("../../../../../lib/implementation-job-create", () => ({
  createImplementationJobForRun: mocks.createImplementationJobForRun,
}));

const { POST } = await import("./route");

describe("POST /api/runs/[runId]/decision", () => {
  beforeEach(() => {
    mocks.runsFindOne.mockReset();
    mocks.runsFindOneAndUpdate.mockReset();
    mocks.signalsFind.mockReset();
    mocks.signalsUpdateMany.mockReset();
    mocks.plansUpdateMany.mockReset();
    mocks.withTransaction.mockReset();
    mocks.endSession.mockReset();
    mocks.createImplementationJobForRun.mockReset();

    mocks.withTransaction.mockImplementation(async (callback: () => Promise<void>) => callback());
    mocks.endSession.mockResolvedValue(undefined);
    mocks.signalsUpdateMany.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mocks.plansUpdateMany.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mocks.createImplementationJobForRun.mockResolvedValue({
      status: "created",
      job: { _id: "job-created", status: "queued", runId: "default-run" },
    });
  });

  it("approves only related signals that are still plan_ready and updates plans for that scoped set", async () => {
    const runId = new ObjectId("64f0c1f2a3b4c5d6e7f81001");
    const planReadySignalId = new ObjectId("64f0c1f2a3b4c5d6e7f81002");
    const now = "2026-06-01T12:00:00.000Z";
    const run = {
      _id: runId,
      source: "dashboard_upload",
      status: "plan_ready",
      workspaceId: "demo",
      repoConnectionId: "repo-123",
      createdAt: now,
      updatedAt: now,
      screenshotNames: [],
      comments: [],
      signal: { title: "Plan ready bug", summary: "A bug has enough evidence.", confidence: 0.9, evidence: [] },
      plan: { recommendedChange: "Fix the bug.", filesToChange: [], guardrails: [], acceptanceCriteria: [] },
    };

    mocks.runsFindOne.mockResolvedValue(run);
    mocks.runsFindOneAndUpdate.mockResolvedValue({
      ...run,
      _id: runId,
      status: "approved",
      founderDecision: { action: "approve", note: "Ship it.", decidedAt: now, decidedBy: "user-test" },
    });
    mocks.signalsFind.mockReturnValue({
      toArray: vi.fn(async () => [
        { _id: planReadySignalId, workspaceId: "demo", repoConnectionId: "repo-123", status: "plan_ready", type: "bug", evidenceItems: [{ runId: runId.toString() }] },
      ]),
    });

    const response = await POST(
      authedRequest(`http://localhost/api/runs/${runId.toString()}/decision`, {
        method: "POST",
        body: JSON.stringify({ action: "approve", note: "Ship it.", repoConnectionId: "repo-123" }),
      }),
      { params: Promise.resolve({ runId: runId.toString() }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.implementationJobId).toBe("job-created");
    expect(mocks.createImplementationJobForRun).toHaveBeenCalledOnce();
    expect(mocks.createImplementationJobForRun).toHaveBeenCalledWith({
      workspaceId: "demo",
      runId: runId.toString(),
      repoConnectionId: "repo-123",
      approvedByUserId: "user-test",
    });
    const scopedSignalFilter = {
      workspaceId: "demo",
      repoConnectionId: "repo-123",
      "evidenceItems.runId": runId.toString(),
      status: "plan_ready",
    };
    expect(mocks.signalsFind).toHaveBeenCalledWith(scopedSignalFilter, expect.objectContaining({ session: expect.any(Object) }));
    expect(mocks.signalsUpdateMany).toHaveBeenCalledWith(
      scopedSignalFilter,
      { $set: expect.objectContaining({ status: "approved" }) },
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(mocks.plansUpdateMany).toHaveBeenCalledWith(
      {
        workspaceId: "demo",
        repoConnectionId: "repo-123",
        signalId: { $in: [planReadySignalId.toString()] },
        status: { $ne: "rejected" },
      },
      { $set: expect.objectContaining({ status: "approved" }) },
      expect.objectContaining({ session: expect.any(Object) }),
    );
  });

  it("does not create an implementation job when the founder rejects the run", async () => {
    const runId = new ObjectId("64f0c1f2a3b4c5d6e7f81011");
    const now = "2026-06-01T12:00:00.000Z";
    const run = {
      _id: runId,
      source: "dashboard_upload",
      status: "plan_ready",
      workspaceId: "demo",
      repoConnectionId: "repo-123",
      createdAt: now,
      updatedAt: now,
      screenshotNames: [],
      comments: [],
      signal: { title: "Plan ready bug", summary: "A bug has enough evidence.", confidence: 0.9, evidence: [] },
      plan: { recommendedChange: "Fix the bug.", filesToChange: [], guardrails: [], acceptanceCriteria: [] },
    };
    mocks.runsFindOne.mockResolvedValue(run);
    mocks.runsFindOneAndUpdate.mockResolvedValue({
      ...run,
      status: "rejected",
      founderDecision: { action: "reject", note: "Not now.", decidedAt: now, decidedBy: "user-test" },
    });
    mocks.signalsFind.mockReturnValue({ toArray: vi.fn(async () => []) });

    const response = await POST(
      authedRequest(`http://localhost/api/runs/${runId.toString()}/decision`, {
        method: "POST",
        body: JSON.stringify({ action: "reject", note: "Not now.", repoConnectionId: "repo-123" }),
      }),
      { params: Promise.resolve({ runId: runId.toString() }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.implementationJobId).toBeUndefined();
    expect(mocks.createImplementationJobForRun).not.toHaveBeenCalled();
  });

  it("includes the existing implementation job id when approval finds a duplicate job", async () => {
    const runId = new ObjectId("64f0c1f2a3b4c5d6e7f81031");
    const now = "2026-06-01T12:00:00.000Z";
    const run = {
      _id: runId,
      source: "dashboard_upload",
      status: "plan_ready",
      workspaceId: "demo",
      repoConnectionId: "repo-123",
      createdAt: now,
      updatedAt: now,
      screenshotNames: [],
      comments: [],
      signal: { title: "Plan ready bug", summary: "A bug has enough evidence.", confidence: 0.9, evidence: [] },
      plan: { recommendedChange: "Fix the bug.", filesToChange: [], guardrails: [], acceptanceCriteria: [] },
    };
    mocks.runsFindOne.mockResolvedValue(run);
    mocks.runsFindOneAndUpdate.mockResolvedValue({
      ...run,
      status: "approved",
      founderDecision: { action: "approve", note: "Ship it.", decidedAt: now, decidedBy: "user-test" },
    });
    mocks.signalsFind.mockReturnValue({ toArray: vi.fn(async () => []) });
    mocks.createImplementationJobForRun.mockResolvedValue({
      status: "duplicate",
      job: { _id: "job-existing", status: "queued", runId: runId.toString() },
    });

    const response = await POST(
      authedRequest(`http://localhost/api/runs/${runId.toString()}/decision`, {
        method: "POST",
        body: JSON.stringify({ action: "approve", note: "Ship it.", repoConnectionId: "repo-123" }),
      }),
      { params: Promise.resolve({ runId: runId.toString() }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.implementationJobId).toBe("job-existing");
  });

  it("still returns a successful approval response when implementation job creation fails", async () => {
    const runId = new ObjectId("64f0c1f2a3b4c5d6e7f81021");
    const now = "2026-06-01T12:00:00.000Z";
    const run = {
      _id: runId,
      source: "dashboard_upload",
      status: "plan_ready",
      workspaceId: "demo",
      repoConnectionId: "repo-123",
      createdAt: now,
      updatedAt: now,
      screenshotNames: [],
      comments: [],
      signal: { title: "Plan ready bug", summary: "A bug has enough evidence.", confidence: 0.9, evidence: [] },
      plan: { recommendedChange: "Fix the bug.", filesToChange: [], guardrails: [], acceptanceCriteria: [] },
    };
    mocks.runsFindOne.mockResolvedValue(run);
    mocks.runsFindOneAndUpdate.mockResolvedValue({
      ...run,
      status: "approved",
      founderDecision: { action: "approve", note: "Ship it.", decidedAt: now, decidedBy: "user-test" },
    });
    mocks.signalsFind.mockReturnValue({ toArray: vi.fn(async () => []) });
    mocks.createImplementationJobForRun.mockRejectedValue(new Error("job create failed"));

    const response = await POST(
      authedRequest(`http://localhost/api/runs/${runId.toString()}/decision`, {
        method: "POST",
        body: JSON.stringify({ action: "approve", note: "Ship it.", repoConnectionId: "repo-123" }),
      }),
      { params: Promise.resolve({ runId: runId.toString() }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.run.status).toBe("approved");
    expect(body.implementationJobId).toBeUndefined();
  });
});
