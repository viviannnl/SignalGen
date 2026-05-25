import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/signal-memory-store", () => ({
  serializePlan: (doc: Record<string, unknown>) => ({ ...doc, _id: doc._id?.toString() }),
  serializeSignal: (doc: Record<string, unknown>) => ({ ...doc, _id: doc._id?.toString() }),
}));

vi.mock("@/lib/workspace", () => ({
  buildWorkspaceFilter: () => ({}),
  resolveWorkspaceId: () => undefined,
}));

const { GET } = await import("./route");

function mockFindToArray(findMock: ReturnType<typeof vi.fn>, docs: unknown[]) {
  const toArray = vi.fn(async () => docs);
  const limit = vi.fn(() => ({ toArray }));
  const sort = vi.fn(() => ({ limit, toArray }));
  findMock.mockReturnValue({ sort });
  return { sort, limit, toArray };
}

function makeLegacyRun({ status, now }: { status: string; now: string }) {
  return {
    _id: new ObjectId("64f0c1f2a3b4c5d6e7f80901"),
    source: "dashboard_upload",
    status,
    createdAt: now,
    updatedAt: now,
    processedAt: now,
    comments: ["The download button did not appear after generation."],
    screenshotNames: ["feedback.png"],
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

  it("does not expose an awaiting-founder plan on legacy fallback signals that are still accumulating", async () => {
    const now = "2026-05-23T18:06:24.000Z";
    mockFindToArray(mockSignalsFind, []);
    mockFindToArray(mockRunsFind, [
      makeLegacyRun({ status: "processed", now }),
    ]);

    const response = await GET(new Request("http://localhost/api/signals"));
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

    const response = await GET(new Request("http://localhost/api/signals"));
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
});
