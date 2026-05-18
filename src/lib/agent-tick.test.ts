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
  it("processes pending uploaded runs and persists agent analysis", async () => {
    const updatedRuns: SignalGenRun[] = [];
    const store: AgentTickStore = {
      listPendingRuns: vi.fn(async () => [makeRun()]),
      updateRunAnalysis: vi.fn(async (runId, update) => {
        updatedRuns.push({ ...makeRun({ _id: runId }), ...update });
        return true;
      }),
    };

    const result = await processAgentTick(store, { limit: 5 });

    expect(result.ok).toBe(true);
    expect(result.processedCount).toBe(1);
    expect(result.processedRunIds).toEqual(["run-1"]);
    expect(store.listPendingRuns).toHaveBeenCalledWith(5, undefined);
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

    expect(result).toEqual({ ok: true, processedCount: 0, processedRunIds: [] });
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
    expect(savedUpdate?.signal.title).toBe("No actionable signal detected yet");
  });
});
