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

const mockSignalsFindOne = vi.fn();
const mockPlansFind = vi.fn();
const mockRunsFind = vi.fn();
const mockFindImplementationJobByIdempotencyKey = vi.fn();

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn((name: string) => {
      if (name === "signals") return { findOne: mockSignalsFindOne };
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

vi.mock("@/lib/implementation-job-db", () => ({
  findImplementationJobByIdempotencyKey: mockFindImplementationJobByIdempotencyKey,
}));

vi.mock("@/lib/signal-memory-store", () => ({
  serializePlan: (doc: Record<string, unknown>) => ({ ...doc, _id: doc._id?.toString() }),
  serializeSignal: (doc: Record<string, unknown>) => ({ ...doc, _id: doc._id?.toString() }),
}));

vi.mock("@/lib/workspace", () => ({
  buildWorkspaceRepoFilter: (workspaceId: string, repoConnectionId?: string) => ({ workspaceId, ...(repoConnectionId ? { repoConnectionId } : {}) }),
  resolveRepoConnectionId: (request: Request) => new URL(request.url).searchParams.get("repoConnectionId") ?? undefined,
}));

const { GET } = await import("./route");

function mockFindToArray(findMock: ReturnType<typeof vi.fn>, docs: unknown[]) {
  const toArray = vi.fn(async () => docs);
  const sort = vi.fn(() => ({ toArray }));
  findMock.mockReturnValue({ sort, toArray });
  return { sort, toArray };
}

describe("GET /api/signals/[signalId]", () => {
  beforeEach(() => {
    mockSignalsFindOne.mockReset();
    mockPlansFind.mockReset();
    mockRunsFind.mockReset();
    mockFindImplementationJobByIdempotencyKey.mockReset();
    mockFindImplementationJobByIdempotencyKey.mockResolvedValue(null);
  });

  it("returns the signal with its plan and resolves an approved signal to a title-matching pr_created source run", async () => {
    const now = "2026-06-07T12:00:00.000Z";
    const signalId = new ObjectId("64f0c1f2a3b4c5d6e7f90001");
    const olderRunId = new ObjectId("64f0c1f2a3b4c5d6e7f90002");
    const sourceRunId = new ObjectId("64f0c1f2a3b4c5d6e7f90003");
    const planId = new ObjectId("64f0c1f2a3b4c5d6e7f90004");

    mockSignalsFindOne.mockResolvedValue({
      _id: signalId,
      workspaceId: "demo",
      repoConnectionId: "repo-123",
      type: "feature_request",
      title: "Additional resume format options",
      summary: "Users want more resume format choices.",
      signalKey: "feature_request:additional-resume-format-options",
      evidenceItemIds: ["older", "source"],
      evidenceItems: [
        { id: "older", runId: olderRunId.toString(), clusterType: "feature_request", title: "Additional resume format options", summary: "Older evidence.", commentIds: [], frequency: 1, confidence: 0.9, severity: "medium", decision: "propose_plan", createdAt: now },
        { id: "source", runId: sourceRunId.toString(), clusterType: "feature_request", title: "Additional resume format options", summary: "PR evidence.", commentIds: [], frequency: 2, confidence: 0.94, severity: "medium", decision: "propose_plan", createdAt: now },
      ],
      strength: 0.86,
      confidence: 0.94,
      status: "approved",
      currentPlanId: planId.toString(),
      createdAt: now,
      updatedAt: now,
    });
    mockFindToArray(mockPlansFind, [
      {
        _id: planId,
        workspaceId: "demo",
        repoConnectionId: "repo-123",
        signalId: signalId.toString(),
        recommendedChange: "Add PDF and DOCX options.",
        filesToChange: ["src/app/resume/page.tsx"],
        guardrails: ["Keep existing PDF export."],
        acceptanceCriteria: ["Users can select a format."],
        status: "approved",
        approvalDecision: { action: "approve", note: "Ship it.", decidedAt: now, decidedBy: "user-test" },
        createdAt: now,
        updatedAt: now,
      },
    ]);
    mockFindToArray(mockRunsFind, [
      {
        _id: olderRunId,
        workspaceId: "demo",
        repoConnectionId: "repo-123",
        status: "needs_review",
        signal: { title: "Direct Resume Submission", summary: "Wrong primary run signal.", confidence: 0.8, evidence: [] },
        plan: { recommendedChange: "Wrong plan.", filesToChange: [], guardrails: [], acceptanceCriteria: [] },
        screenshotNames: [],
        comments: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: sourceRunId,
        workspaceId: "demo",
        repoConnectionId: "repo-123",
        status: "pr_created",
        founderDecision: { action: "approve", note: "Ship it.", decidedAt: now, decidedBy: "user-test" },
        signal: { title: "Additional resume format options", summary: "Matching primary run signal.", confidence: 0.94, evidence: [] },
        plan: { recommendedChange: "Add PDF and DOCX options.", filesToChange: [], guardrails: [], acceptanceCriteria: [] },
        implementation: { status: "succeeded", summary: "PR opened.", branchName: "signalgen/formats", guardrails: [], createdAt: now, createdBy: "user-test", updatedAt: now, prDraft: { title: "Implement formats", body: "body", branchName: "signalgen/formats", filesToInspect: [], testCommands: [], checklist: [], previewUrl: "https://preview.example.com" } },
        pr: { url: "https://github.com/viviannnl/SignalGen/pull/99" },
        screenshotNames: [],
        comments: [],
        createdAt: now,
        updatedAt: now,
      },
    ]);
    mockFindImplementationJobByIdempotencyKey.mockResolvedValue({ status: "succeeded", prUrl: "https://github.com/viviannnl/SignalGen/pull/99" });

    const response = await GET(authedRequest(`http://localhost/api/signals/${signalId}?repoConnectionId=repo-123`), { params: Promise.resolve({ signalId: signalId.toString() }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true });
    expect(body.signal).toMatchObject({ _id: signalId.toString(), title: "Additional resume format options" });
    expect(body.plan).toMatchObject({ _id: planId.toString(), recommendedChange: "Add PDF and DOCX options." });
    expect(body.run).toMatchObject({ _id: sourceRunId.toString(), status: "pr_created", prUrl: "https://github.com/viviannnl/SignalGen/pull/99" });
    expect(body.run._id).not.toBe(olderRunId.toString());
    expect(body.implementationJob).toMatchObject({ status: "succeeded" });
    expect(mockFindImplementationJobByIdempotencyKey).toHaveBeenCalledWith(`demo:${sourceRunId.toString()}`, "demo");
  });

  it("returns 404 when the signal is missing in the workspace/repo scope", async () => {
    const signalId = new ObjectId("64f0c1f2a3b4c5d6e7f90011");
    mockSignalsFindOne.mockResolvedValue(null);

    const response = await GET(authedRequest(`http://localhost/api/signals/${signalId}?repoConnectionId=repo-123`), { params: Promise.resolve({ signalId: signalId.toString() }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Signal not found.");
  });
});
