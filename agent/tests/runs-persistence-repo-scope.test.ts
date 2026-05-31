import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const signals = {
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
  };
  const plans = {
    findOne: vi.fn(),
    insertOne: vi.fn(),
  };
  const runs = {
    updateOne: vi.fn(),
  };
  const db = {
    collection: vi.fn((name: string) => {
      if (name === "signals") return signals;
      if (name === "plans") return plans;
      if (name === "runs") return runs;
      throw new Error(`Unexpected collection ${name}`);
    }),
  };
  const client = { db: vi.fn(() => db), close: vi.fn() };
  const mongoClient = { connect: vi.fn(async () => client) };
  const MongoClient = vi.fn(function MongoClientMock() {
    return mongoClient;
  });

  return { MongoClient, mongoClient, client, db, signals, plans, runs };
});

vi.mock("mongodb", async () => {
  const actual = await vi.importActual<typeof import("mongodb")>("mongodb");
  return {
    ...actual,
    MongoClient: mocks.MongoClient,
  };
});

import { persistSignalMemoryForRun, closeMongoClient } from "../src/tools/runs.js";
import type { ProcessRunResult, SignalGenRun } from "../src/schemas.js";

describe("persistSignalMemoryForRun repo scoping", () => {
  beforeEach(async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://example.test/signalgen");
    vi.clearAllMocks();
    mocks.signals.find.mockReturnValue({ toArray: vi.fn(async () => []) });
    mocks.signals.findOneAndUpdate.mockResolvedValue({
      _id: { toString: () => "signal-1" },
      evidenceItems: [],
    });
    mocks.signals.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.plans.findOne.mockResolvedValue(null);
    mocks.plans.insertOne.mockResolvedValue({ insertedId: { toString: () => "plan-1" } });
    mocks.runs.updateOne.mockResolvedValue({ modifiedCount: 1 });
    await closeMongoClient();
  });

  it("persists hosted worker signals and plans inside the run repo scope", async () => {
    const run: SignalGenRun = {
      _id: "64f0c1f2a3b4c5d6e7f80901",
      status: "uploaded",
      workspaceId: "ws-123",
      repoConnectionId: "repo-456",
      comments: ["姐 简历有没有其他 format type 可以选择?"],
    };
    const result: ProcessRunResult = {
      runId: "64f0c1f2a3b4c5d6e7f80901",
      status: "plan_ready",
      comments: ["姐 简历有没有其他 format type 可以选择?"],
      signalClusters: [
        {
          id: "feature_request-additional-resume-format-options-3",
          type: "feature_request",
          title: "Additional resume format options",
          summary: "Users want more supported resume format choices.",
          evidenceCommentIds: ["comment-1"],
          severity: "medium",
          frequency: 3,
          confidence: 0.9,
          decision: "propose_plan",
          rationale: "Repeated feature request.",
        },
      ],
      plan: {
        recommendedChange: "Add format choices.",
        filesToChange: ["resume-flow"],
        guardrails: ["Founder approval required."],
        acceptanceCriteria: ["Formats are visible."],
      },
    };

    await persistSignalMemoryForRun(run, result);

    expect(mocks.signals.find).toHaveBeenCalledWith({ workspaceId: "ws-123", repoConnectionId: "repo-456" });
    expect(mocks.signals.findOneAndUpdate).toHaveBeenCalledWith(
      { workspaceId: "ws-123", repoConnectionId: "repo-456", signalKey: "feature_request:additional-resume-format-options" },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ workspaceId: "ws-123", repoConnectionId: "repo-456" }),
      }),
      { upsert: true, returnDocument: "after" },
    );
    expect(mocks.plans.findOne).toHaveBeenCalledWith({ workspaceId: "ws-123", repoConnectionId: "repo-456", signalId: "signal-1", status: { $ne: "rejected" } });
    expect(mocks.plans.insertOne).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws-123", repoConnectionId: "repo-456", signalId: "signal-1" }));
    expect(mocks.signals.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-123", repoConnectionId: "repo-456" }),
      expect.any(Object),
    );
    expect(mocks.runs.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-123", repoConnectionId: "repo-456" }),
      expect.any(Object),
    );
  });

  it("does not reuse the top run-level implementation plan for secondary plan-ready signals", async () => {
    const run: SignalGenRun = {
      _id: "64f0c1f2a3b4c5d6e7f80902",
      status: "uploaded",
      workspaceId: "ws-123",
      repoConnectionId: "repo-456",
      comments: ["Need format options", "Submit button is confusing"],
    };
    const result: ProcessRunResult = {
      runId: "64f0c1f2a3b4c5d6e7f80902",
      status: "plan_ready",
      comments: ["Need format options", "Submit button is confusing"],
      signal: {
        title: "Additional resume format options",
        summary: "Users want more supported resume format choices.",
        confidence: 0.9,
        evidence: ["Need format options"],
      },
      signalClusters: [
        {
          id: "feature_request-additional-resume-format-options-3",
          type: "feature_request",
          title: "Additional resume format options",
          summary: "Users want more supported resume format choices.",
          evidenceCommentIds: ["comment-1"],
          severity: "medium",
          frequency: 3,
          confidence: 0.9,
          decision: "propose_plan",
          rationale: "Repeated feature request.",
        },
        {
          id: "friction-confusing-submit-button-3",
          type: "friction",
          title: "Confusing submit button",
          summary: "Users are confused about where to submit.",
          evidenceCommentIds: ["comment-2"],
          severity: "medium",
          frequency: 3,
          confidence: 0.88,
          decision: "propose_plan",
          rationale: "Repeated friction.",
        },
      ],
      plan: {
        recommendedChange: "Add format choices.",
        filesToChange: ["resume-flow"],
        guardrails: ["Founder approval required."],
        acceptanceCriteria: ["Formats are visible."],
      },
    };

    mocks.signals.findOneAndUpdate.mockImplementation(async (filter: { signalKey?: string }) => ({
      _id: { toString: () => filter.signalKey?.includes("confusing-submit-button") ? "signal-submit" : "signal-format" },
      evidenceItems: [],
    }));

    await persistSignalMemoryForRun(run, result);

    const insertedPlans = mocks.plans.insertOne.mock.calls.map((call) => call[0]);
    expect(insertedPlans).toHaveLength(2);
    expect(insertedPlans[0]).toEqual(expect.objectContaining({
      signalId: "signal-format",
      recommendedChange: "Add format choices.",
    }));
    expect(insertedPlans[1]).toEqual(expect.objectContaining({
      signalId: "signal-submit",
      recommendedChange: expect.stringContaining("Confusing submit button"),
      filesToChange: ["Product UI/content file to be selected after founder approval"],
    }));
  });
});
