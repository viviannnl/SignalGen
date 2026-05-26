import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildMongoSignalMemoryStore } from "./signal-memory-store";
import type { ProductSignal, SignalGenRun, SignalPlan } from "./types";

const signalsCollection = {
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
};
const plansCollection = {
  find: vi.fn(),
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
};
const runsCollection = {
  updateOne: vi.fn(),
};
const db = {
  collection: vi.fn((name: string) => {
    if (name === "signals") return signalsCollection;
    if (name === "plans") return plansCollection;
    throw new Error(`Unexpected collection ${name}`);
  }),
};

function makeRun(overrides: Partial<SignalGenRun> = {}): SignalGenRun {
  return {
    _id: new ObjectId("64f0c1f2a3b4c5d6e7f80901").toString(),
    workspaceId: "ws-test",
    repoConnectionId: "repo-123",
    source: "dashboard_upload",
    status: "plan_ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    screenshotNames: [],
    comments: ["Please add Slack alerts."],
    signal: { title: "Slack alerts", summary: "Slack alerts requested.", confidence: 0.9, evidence: [] },
    plan: { recommendedChange: "Add Slack alerts.", filesToChange: [], guardrails: [], acceptanceCriteria: [] },
    ...overrides,
  };
}

function makeSignal(overrides: Partial<ProductSignal> = {}): ProductSignal {
  return {
    workspaceId: "ws-test",
    repoConnectionId: "repo-123",
    type: "feature_request",
    title: "Slack alerts",
    summary: "Users want Slack alerts.",
    signalKey: "feature_request:slack-alerts",
    evidenceItemIds: ["evidence-1"],
    evidenceItems: [
      {
        id: "evidence-1",
        runId: "64f0c1f2a3b4c5d6e7f80901",
        clusterType: "feature_request",
        title: "Slack alerts",
        summary: "Users want Slack alerts.",
        commentIds: ["comment-1"],
        frequency: 1,
        confidence: 0.9,
        severity: "medium",
        decision: "propose_plan",
        createdAt: "2026-01-01T00:01:00.000Z",
      },
    ],
    strength: 0.2,
    confidence: 0.9,
    status: "plan_ready",
    createdAt: "2026-01-01T00:01:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
}

function makePlan(overrides: Partial<SignalPlan> = {}): SignalPlan {
  return {
    workspaceId: "ws-test",
    repoConnectionId: "repo-123",
    signalId: "new-signal-64f0c1f2a3b4c5d6e7f80901-0",
    recommendedChange: "Add Slack alerts.",
    filesToChange: [],
    guardrails: [],
    acceptanceCriteria: [],
    status: "draft",
    createdAt: "2026-01-01T00:01:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
}

describe("buildMongoSignalMemoryStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signalsCollection.findOneAndUpdate.mockResolvedValue({ ...makeSignal(), _id: new ObjectId("64f0c1f2a3b4c5d6e7f80902"), evidenceItems: [] });
    signalsCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
    plansCollection.findOne.mockResolvedValue(null);
    plansCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId("64f0c1f2a3b4c5d6e7f80903") });
    plansCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
    runsCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("persists signal memory with workspace and repo predicates on all writes", async () => {
    const store = buildMongoSignalMemoryStore(db as never, runsCollection as never);
    const run = makeRun();

    await store.persistSignalMemory(run, {
      evidenceItems: makeSignal().evidenceItems ?? [],
      signalsToCreate: [makeSignal()],
      signalsToUpdate: [{ signalId: "64f0c1f2a3b4c5d6e7f80904", update: { updatedAt: "2026-01-01T00:02:00.000Z" } }],
      plansToCreate: [makePlan()],
      plansToUpdate: [{ planId: "64f0c1f2a3b4c5d6e7f80905", update: { status: "approved" } }],
    });

    expect(signalsCollection.findOneAndUpdate).toHaveBeenCalledWith(
      { workspaceId: "ws-test", repoConnectionId: "repo-123", signalKey: "feature_request:slack-alerts" },
      expect.any(Object),
      expect.any(Object),
    );
    expect(signalsCollection.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId("64f0c1f2a3b4c5d6e7f80904"), workspaceId: "ws-test", repoConnectionId: "repo-123" },
      expect.any(Object),
    );
    expect(plansCollection.findOne).toHaveBeenCalledWith({ workspaceId: "ws-test", repoConnectionId: "repo-123", signalId: "64f0c1f2a3b4c5d6e7f80902", status: { $ne: "rejected" } });
    expect(plansCollection.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId("64f0c1f2a3b4c5d6e7f80905"), workspaceId: "ws-test", repoConnectionId: "repo-123" },
      expect.any(Object),
    );
    expect(runsCollection.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId("64f0c1f2a3b4c5d6e7f80901"), workspaceId: "ws-test", repoConnectionId: "repo-123" },
      expect.any(Object),
    );
  });
});
