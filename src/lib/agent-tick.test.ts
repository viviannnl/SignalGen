import { describe, expect, it, vi } from "vitest";

import { processAgentTick, type AgentTickStore } from "./agent-tick";
import type { SignalGenRun } from "./types";

function makeRun(overrides: Partial<SignalGenRun> = {}): SignalGenRun {
  const now = new Date("2026-01-01T00:00:00.000Z").toISOString();

  return {
    _id: "run-1",
    source: "dashboard_upload",
    status: "uploaded",
    createdAt: now,
    updatedAt: now,
    screenshotNames: ["feedback.png"],
    comments: [
      "Can you add Slack integration?",
      "We need Slack support.",
      "Would love a Slack integration feature.",
    ],
    signal: {
      title: "Pending feedback upload",
      summary: "SignalGen has stored the upload and is waiting for the agent tick.",
      confidence: 0,
      evidence: [],
    },
    plan: {
      recommendedChange: "Waiting for the agent to decide whether there is enough evidence to act.",
      filesToChange: [],
      guardrails: ["No code changes before founder approval."],
      acceptanceCriteria: [],
    },
    ...overrides,
  };
}

describe("processAgentTick", () => {
  it("processes pending uploaded runs through the integrated ADK agent runtime and persists analysis", async () => {
    const updatedRuns: SignalGenRun[] = [];
    const agentRuntime = {
      kind: "adk" as const,
      analyzeRun: vi.fn(async (run: SignalGenRun) => ({
        status: "plan_ready" as const,
        updatedAt: "2026-01-01T00:01:00.000Z",
        processedAt: "2026-01-01T00:01:00.000Z",
        signalClusters: [
          {
            id: "feature_request-3",
            type: "feature_request" as const,
            title: "Repeated feature request detected",
            summary: "3 related comments classified as feature request.",
            evidenceCommentIds: ["comment-1", "comment-2", "comment-3"],
            severity: "medium" as const,
            frequency: 3,
            confidence: 0.91,
            decision: "propose_plan" as const,
            rationale: "Evidence is strong enough to draft a plan.",
          },
        ],
        signal: {
          title: "Repeated feature request detected",
          summary: "3 related comments classified as feature request.",
          confidence: 0.91,
          evidence: run.comments,
        },
        plan: {
          recommendedChange: "Draft a product improvement.",
          filesToChange: ["Product UI/content file to be selected after founder approval"],
          guardrails: ["No code changes before founder approval."],
          acceptanceCriteria: ["Plan cites evidence."],
        },
      })),
    };
    const store: AgentTickStore = {
      listPendingRuns: vi.fn(async () => [makeRun()]),
      updateRunAnalysis: vi.fn(async (runId, update) => {
        updatedRuns.push({ ...makeRun({ _id: runId }), ...update });
        return true;
      }),
    };

    const result = await processAgentTick(store, { limit: 5, agentRuntime });

    expect(result.ok).toBe(true);
    expect(result.runtime).toBe("adk");
    expect(result.processedCount).toBe(1);
    expect(result.processedRunIds).toEqual(["run-1"]);
    expect(store.listPendingRuns).toHaveBeenCalledWith(5, undefined);
    expect(agentRuntime.analyzeRun).toHaveBeenCalledWith(makeRun());
    expect(store.updateRunAnalysis).toHaveBeenCalledOnce();
    expect(updatedRuns[0].status).toBe("plan_ready");
    expect(updatedRuns[0].signal.title).toBe("Repeated feature request detected");
    expect(updatedRuns[0].signal.evidence).toHaveLength(3);
    expect(updatedRuns[0].plan.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(updatedRuns[0].signalClusters?.[0].decision).toBe("propose_plan");
  });

  it("can target the newly created run id instead of only the oldest pending backlog", async () => {
    const store: AgentTickStore = {
      listPendingRuns: vi.fn(async () => [makeRun({ _id: "new-run" })]),
      updateRunAnalysis: vi.fn(async () => true),
    };

    const result = await processAgentTick(store, { limit: 5, runId: "new-run" });

    expect(result.processedRunIds).toEqual(["new-run"]);
    expect(store.listPendingRuns).toHaveBeenCalledWith(5, "new-run");
  });

  it("does not process completed or non-pending runs returned by the store", async () => {
    const store: AgentTickStore = {
      listPendingRuns: vi.fn(async () => [makeRun({ _id: "approved-run", status: "approved" })]),
      updateRunAnalysis: vi.fn(async () => true),
    };

    const result = await processAgentTick(store);

    expect(result.ok).toBe(true);
    expect(result.processedCount).toBe(0);
    expect(result.processedRunIds).toEqual([]);
    expect(store.updateRunAnalysis).not.toHaveBeenCalled();
  });

  it("handles no pending runs safely", async () => {
    const store: AgentTickStore = {
      listPendingRuns: vi.fn(async () => []),
      updateRunAnalysis: vi.fn(async () => true),
    };

    const result = await processAgentTick(store);

    expect(result).toEqual({ ok: true, runtime: "adk", processedCount: 0, processedRunIds: [] });
    expect(store.updateRunAnalysis).not.toHaveBeenCalled();
  });

  it("marks runs with no comments as insufficient evidence so they do not stay pending forever", async () => {
    let savedUpdate: Partial<SignalGenRun> | undefined;
    const store: AgentTickStore = {
      listPendingRuns: vi.fn(async () => [makeRun({ _id: "empty-run", comments: [] })]),
      updateRunAnalysis: vi.fn(async (_runId, update) => {
        savedUpdate = update;
        return true;
      }),
    };

    const result = await processAgentTick(store, { runId: "empty-run" });

    expect(result.processedRunIds).toEqual(["empty-run"]);
    expect(savedUpdate?.status).toBe("insufficient_evidence");
    expect(savedUpdate?.signal?.title).toBe("No actionable signal detected yet");
  });
});
