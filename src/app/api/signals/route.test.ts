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

const mockSignalsFind = vi.fn();
const mockPlansFind = vi.fn();
const mockRunsFind = vi.fn();

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn((name: string) => {
      if (name === "signals") return { find: mockSignalsFind };
      if (name === "plans") return { find: mockPlansFind };
      if (name === "runs") return { find: mockRunsFind };
      throw new Error(`Unexpected collection ${name}`);
    }),
  })),
}));

vi.mock("@/lib/repo-connection-db", () => ({
  findRepoConnectionById: vi.fn(async (id: string) => ({
    _id: id,
    workspaceId: "demo",
    status: "connected",
  })),
}));

vi.mock("@/lib/signal-memory-store", () => ({
  serializePlan: (doc: Record<string, unknown>) => ({ ...doc, _id: doc._id?.toString() }),
  serializeSignal: (doc: Record<string, unknown>) => ({ ...doc, _id: doc._id?.toString() }),
}));

vi.mock("@/lib/workspace", () => ({
  buildWorkspaceFilter: () => ({}),
  buildWorkspaceRepoFilter: (workspaceId: string, repoConnectionId?: string) => ({ workspaceId, ...(repoConnectionId ? { repoConnectionId } : {}) }),
  resolveRepoConnectionId: (request: Request) => new URL(request.url).searchParams.get("repoConnectionId") ?? undefined,
  resolveWorkspaceId: () => "demo",
}));

const { GET } = await import("./route");

function mockFindToArray(findMock: ReturnType<typeof vi.fn>, docs: unknown[]) {
  const toArray = vi.fn(async () => docs);
  const limit = vi.fn(() => ({ toArray }));
  const sort = vi.fn(() => ({ limit, toArray }));
  findMock.mockReturnValue({ sort });
  return { sort, limit, toArray };
}

function makeLegacyRun({ status, now, repoConnectionId = "repo-123" }: { status: string; now: string; repoConnectionId?: string }) {
  return {
    _id: new ObjectId("64f0c1f2a3b4c5d6e7f80901"),
    source: "dashboard_upload",
    status,
    createdAt: now,
    updatedAt: now,
    processedAt: now,
    comments: ["The download button did not appear after generation."],
    screenshotNames: ["feedback.png"],
    repoConnectionId,
    signal: {
      title: "Critical Download Button Failure",
      summary: "A user reported that the download button did not appear after generation.",
      confidence: 0.95,
      evidence: ["The download button did not appear after generation."],
    },
    signalClusters: [
      {
        id: "cluster-1",
        type: "bug",
        title: "Critical Download Button Failure",
        summary: "A user reported that the download button did not appear after generation.",
        confidence: 0.95,
        evidenceCount: 1,
        evidenceCommentIds: ["comment-1"],
        severity: "high",
        frequency: 1,
        decision: "store_only",
        rationale: "Stored for more evidence.",
      },
    ],
    plan: {
      recommendedChange: "Store this signal in memory and wait for more evidence before proposing a product change.",
      filesToChange: [],
      guardrails: [],
      acceptanceCriteria: [],
    },
  };
}

describe("GET /api/signals", () => {
  beforeEach(() => {
    mockSignalsFind.mockReset();
    mockPlansFind.mockReset();
    mockRunsFind.mockReset();
  });

  it("filters signals, plans, and fallback runs to the selected repoConnectionId", async () => {
    mockFindToArray(mockSignalsFind, [
      {
        _id: new ObjectId("64f0c1f2a3b4c5d6e7f80902"),
        workspaceId: "demo",
        repoConnectionId: "repo-123",
        type: "bug",
        title: "Repo scoped bug",
        summary: "Only this repo should show this signal.",
        signalKey: "bug:repo-scoped-bug",
        evidenceItemIds: [],
        strength: 0.5,
        confidence: 0.5,
        status: "accumulating",
        createdAt: "2026-05-23T18:06:24.000Z",
        updatedAt: "2026-05-23T18:06:24.000Z",
      },
    ]);
    mockFindToArray(mockPlansFind, []);
    mockFindToArray(mockRunsFind, []);

    const response = await GET(authedRequest("http://localhost/api/signals?repoConnectionId=repo-123"));

    expect(response.status).toBe(200);
    expect(mockSignalsFind).toHaveBeenCalledWith(expect.objectContaining({ repoConnectionId: "repo-123" }));
    expect(mockPlansFind).toHaveBeenCalledWith(expect.objectContaining({ repoConnectionId: "repo-123" }));
    expect(mockRunsFind).toHaveBeenCalledWith(expect.objectContaining({ repoConnectionId: "repo-123" }));
  });

  it("does not expose an awaiting-founder plan on legacy fallback signals that are still accumulating", async () => {
    const now = "2026-05-23T18:06:24.000Z";
    mockFindToArray(mockSignalsFind, []);
    mockFindToArray(mockRunsFind, [
      makeLegacyRun({ status: "processed", now }),
    ]);

    const response = await GET(authedRequest("http://localhost/api/signals?repoConnectionId=repo-123"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.signals).toHaveLength(1);
    expect(body.signals[0]).toMatchObject({
      title: "Critical Download Button Failure",
      status: "accumulating",
    });
    expect(body.signals[0].currentPlan).toBeUndefined();
    expect(body.signals[0].currentPlanId).toBeUndefined();
  });

  it("keeps legacy PR-created runs connected to their actionable plan", async () => {
    const now = "2026-05-23T18:06:24.000Z";
    mockFindToArray(mockSignalsFind, []);
    mockFindToArray(mockRunsFind, [
      makeLegacyRun({ status: "pr_created", now }),
    ]);

    const response = await GET(authedRequest("http://localhost/api/signals?repoConnectionId=repo-123"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.signals[0]).toMatchObject({
      title: "Critical Download Button Failure",
      status: "implemented",
      currentPlanId: "64f0c1f2a3b4c5d6e7f80901",
    });
    expect(body.signals[0].currentPlan).toMatchObject({
      recommendedChange: "Store this signal in memory and wait for more evidence before proposing a product change.",
    });
  });

  it("links an approved aggregate signal to the approved evidence run instead of an older review run", async () => {
    const now = "2026-05-31T14:22:51.000Z";
    const reviewRunId = new ObjectId("64f0c1f2a3b4c5d6e7f80911");
    const approvedRunId = new ObjectId("64f0c1f2a3b4c5d6e7f80912");
    const signalId = new ObjectId("64f0c1f2a3b4c5d6e7f80913");

    mockFindToArray(mockSignalsFind, [
      {
        _id: signalId,
        workspaceId: "demo",
        repoConnectionId: "repo-123",
        type: "feature_request",
        title: "Direct Resume Submission",
        summary: "A user requests direct resume submission.",
        signalKey: "feature_request:direct-resume-submission",
        evidenceItemIds: ["evidence-review", "evidence-approved"],
        evidenceItems: [
          { id: "evidence-review", runId: reviewRunId.toString(), clusterType: "feature_request", title: "Direct Resume Submission", summary: "Older evidence.", commentIds: [], frequency: 1, confidence: 0.93, severity: "medium", decision: "propose_plan", createdAt: now },
          { id: "evidence-approved", runId: approvedRunId.toString(), clusterType: "feature_request", title: "Direct Resume Submission", summary: "Approved evidence.", commentIds: [], frequency: 1, confidence: 0.93, severity: "medium", decision: "propose_plan", createdAt: now },
        ],
        strength: 0.6,
        confidence: 0.93,
        status: "approved",
        currentPlanId: "64f0c1f2a3b4c5d6e7f80914",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    mockFindToArray(mockPlansFind, [
      {
        _id: new ObjectId("64f0c1f2a3b4c5d6e7f80914"),
        workspaceId: "demo",
        repoConnectionId: "repo-123",
        signalId: signalId.toString(),
        recommendedChange: "Allow direct resume submission.",
        filesToChange: [],
        guardrails: [],
        acceptanceCriteria: [],
        status: "approved",
        approvalDecision: { action: "approve", note: "Ship it.", decidedAt: now, decidedBy: "user-test" },
        createdAt: now,
        updatedAt: now,
      },
    ]);
    mockRunsFind
      .mockReturnValueOnce({
        toArray: vi.fn(async () => [
          { _id: reviewRunId, workspaceId: "demo", repoConnectionId: "repo-123", status: "needs_review", updatedAt: now },
          { _id: approvedRunId, workspaceId: "demo", repoConnectionId: "repo-123", status: "approved", founderDecision: { action: "approve", note: "Ship it.", decidedAt: now, decidedBy: "user-test" }, updatedAt: now },
        ]),
      })
      .mockReturnValueOnce({ sort: vi.fn(() => ({ limit: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })) });

    const response = await GET(authedRequest("http://localhost/api/signals?repoConnectionId=repo-123"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.signals[0]).toMatchObject({
      title: "Direct Resume Submission",
      status: "approved",
      runId: approvedRunId.toString(),
    });
    expect(body.signals[0].runId).not.toBe(reviewRunId.toString());
  });

  it("links an implemented aggregate signal to a PR-created run before falling back to approved evidence", async () => {
    const now = "2026-06-01T12:00:00.000Z";
    const approvedRunId = new ObjectId("64f0c1f2a3b4c5d6e7f80921");
    const prCreatedRunId = new ObjectId("64f0c1f2a3b4c5d6e7f80922");
    const signalId = new ObjectId("64f0c1f2a3b4c5d6e7f80923");

    mockFindToArray(mockSignalsFind, [
      {
        _id: signalId,
        workspaceId: "demo",
        repoConnectionId: "repo-123",
        type: "feature_request",
        title: "Direct Resume Submission",
        summary: "A user requests direct resume submission.",
        signalKey: "feature_request:direct-resume-submission",
        evidenceItemIds: ["evidence-approved", "evidence-pr"],
        evidenceItems: [
          { id: "evidence-approved", runId: approvedRunId.toString(), clusterType: "feature_request", title: "Direct Resume Submission", summary: "Approved evidence.", commentIds: [], frequency: 1, confidence: 0.93, severity: "medium", decision: "propose_plan", createdAt: now },
          { id: "evidence-pr", runId: prCreatedRunId.toString(), clusterType: "feature_request", title: "Direct Resume Submission", summary: "PR evidence.", commentIds: [], frequency: 1, confidence: 0.93, severity: "medium", decision: "propose_plan", createdAt: now },
        ],
        strength: 0.8,
        confidence: 0.93,
        status: "implemented",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    mockFindToArray(mockPlansFind, []);
    mockRunsFind
      .mockReturnValueOnce({
        toArray: vi.fn(async () => [
          { _id: approvedRunId, workspaceId: "demo", repoConnectionId: "repo-123", status: "approved", updatedAt: now },
          { _id: prCreatedRunId, workspaceId: "demo", repoConnectionId: "repo-123", status: "pr_created", updatedAt: now },
        ]),
      })
      .mockReturnValueOnce({ sort: vi.fn(() => ({ limit: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })) });

    const response = await GET(authedRequest("http://localhost/api/signals?repoConnectionId=repo-123"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.signals[0]).toMatchObject({
      status: "implemented",
      runId: prCreatedRunId.toString(),
    });
  });
});
