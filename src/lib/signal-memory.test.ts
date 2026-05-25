import { describe, expect, it } from "vitest";

import { buildSignalUpdate, clustersToEvidenceItems, projectRunClustersToSignalMemory } from "./signal-memory";
import type { ProductSignal, SignalCluster } from "./types";

const now = "2026-01-01T00:00:00.000Z";
const opts = { workspaceId: "ws-1", now };

function makeCluster(overrides: Partial<SignalCluster> = {}): SignalCluster {
  return {
    id: "bug-1",
    type: "bug",
    title: "Repeated bug reports detected",
    summary: "Bug reports are clustered.",
    evidenceCommentIds: ["comment-1"],
    severity: "medium",
    frequency: 1,
    confidence: 0.75,
    decision: "needs_more_evidence",
    rationale: "Pattern is emerging.",
    ...overrides,
  };
}

function makeExistingSignal(overrides: Partial<ProductSignal> = {}): ProductSignal {
  return {
    _id: "sig-bug-1",
    workspaceId: "ws-1",
    type: "bug",
    title: "Repeated bug reports detected",
    summary: "One previous bug report.",
    evidenceItemIds: ["evidence-run-1-0"],
    evidenceItems: [
      {
        id: "evidence-run-1-0",
        runId: "run-1",
        clusterType: "bug",
        title: "Repeated bug reports detected",
        summary: "One previous bug report.",
        commentIds: ["comment-1"],
        frequency: 1,
        confidence: 0.7,
        severity: "medium",
        decision: "needs_more_evidence",
        createdAt: now,
      },
    ],
    signalKey: "bug:repeated-bug-reports-detected",
    strength: 0.2,
    confidence: 0.7,
    status: "accumulating",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("projectRunClustersToSignalMemory", () => {
  it("creates multiple independent signals from multiple clusters in one run", () => {
    const clusters = [
      makeCluster({ id: "bug-2", type: "bug", title: "Repeated bug reports detected", frequency: 2, evidenceCommentIds: ["comment-1", "comment-2"], decision: "propose_plan" }),
      makeCluster({ id: "feature-3", type: "feature_request", title: "Repeated feature request detected", frequency: 3, evidenceCommentIds: ["comment-3", "comment-4", "comment-5"], decision: "propose_plan" }),
      makeCluster({ id: "friction-1", type: "friction", title: "Product friction detected", frequency: 1, evidenceCommentIds: ["comment-6"], decision: "store_only" }),
    ];

    const projection = projectRunClustersToSignalMemory("run-1", clusters, [], [], opts);

    expect(projection.signalsToCreate).toHaveLength(3);
    expect(new Set(projection.signalsToCreate.map((signal) => signal.type))).toEqual(new Set(["bug", "feature_request", "friction"]));
    expect(projection.signalsToUpdate).toHaveLength(0);
  });

  it("attaches new evidence to an existing matching signal instead of creating a new signal", () => {
    const existingBugSignal = makeExistingSignal();
    const bugCluster = makeCluster({
      id: "bug-2",
      title: "Different bug wording still same signal family",
      evidenceCommentIds: ["comment-2"],
      frequency: 1,
    });

    const projection = projectRunClustersToSignalMemory("run-2", [bugCluster], [existingBugSignal], [], opts);

    expect(projection.signalsToCreate).toHaveLength(0);
    expect(projection.signalsToUpdate).toHaveLength(1);
    expect(projection.signalsToUpdate[0].signalId).toBe("sig-bug-1");
    expect(projection.signalsToUpdate[0].update.evidenceItemIds).toContain("evidence-run-2-0");
    expect(projection.signalsToUpdate[0].update.evidenceItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "evidence-run-2-0", commentIds: ["comment-2"] }),
      ]),
    );
  });

  it("does not double-count already persisted evidence when a pending run is retried", () => {
    const evidence = clustersToEvidenceItems("retry-run", [makeCluster({ frequency: 2 })], "2026-01-01T00:00:00.000Z")[0];
    const existingSignal = makeExistingSignal({
      evidenceItemIds: [evidence.id],
      evidenceItems: [evidence],
      signalKey: "bug:repeated-bug-reports-detected",
    });

    const update = buildSignalUpdate(existingSignal, [evidence], "2026-01-01T00:05:00.000Z");

    expect(update.evidenceItemIds).toEqual([evidence.id]);
    expect(update.evidenceItems).toEqual([evidence]);
    expect(update.strength).toBe(0.4);
  });

  it("keeps the analyzed run plan when creating first-class plans", () => {
    const projection = projectRunClustersToSignalMemory("run-plan", [makeCluster({ frequency: 3 })], [], [], {
      workspaceId: "ws-1",
      now: "2026-01-01T00:00:00.000Z",
      sourcePlan: {
        recommendedChange: "Use the specific generated plan.",
        filesToChange: ["src/app/dashboard/page.tsx"],
        guardrails: ["Founder approval required."],
        acceptanceCriteria: ["Specific acceptance criterion."],
      },
    });

    expect(projection.plansToCreate[0]).toMatchObject({
      recommendedChange: "Use the specific generated plan.",
      filesToChange: ["src/app/dashboard/page.tsx"],
      guardrails: ["Founder approval required."],
      acceptanceCriteria: ["Specific acceptance criterion."],
    });
  });

  it("does not merge unrelated signals just because they share a type", () => {
    const existingBugSignal = makeExistingSignal({
      title: "Checkout crashes after payment",
      signalKey: "bug:checkout-crashes-after-payment",
    });
    const unrelatedBugCluster = makeCluster({
      id: "bug-upload",
      title: "Upload button fails on Safari",
      evidenceCommentIds: ["comment-9"],
      frequency: 1,
    });

    const projection = projectRunClustersToSignalMemory("run-upload", [unrelatedBugCluster], [existingBugSignal], [], opts);

    expect(projection.signalsToCreate).toHaveLength(1);
    expect(projection.signalsToUpdate).toHaveLength(0);
    expect(projection.signalsToCreate[0].signalKey).toBe("bug:upload-button-fails-on-safari");
  });

  it("keeps a weak signal accumulating instead of marking it plan_ready", () => {
    const weakNoiseCluster = makeCluster({
      id: "noise-1",
      type: "noise",
      title: "Low-signal feedback stored",
      summary: "One low-signal comment.",
      evidenceCommentIds: ["comment-1"],
      frequency: 1,
      confidence: 0.4,
      severity: "low",
      decision: "store_only",
    });

    const projection = projectRunClustersToSignalMemory("run-weak", [weakNoiseCluster], [], [], opts);

    expect(projection.signalsToCreate[0].status).toSatisfy((status: string) => status === "accumulating" || status === "needs_more_evidence");
    expect(projection.signalsToCreate[0].status).not.toBe("plan_ready");
  });

  it("upgrades accumulated evidence to plan_ready when it reaches the bug threshold", () => {
    const existingBugSignal = makeExistingSignal({ status: "needs_more_evidence" });
    const newBugCluster = makeCluster({
      id: "bug-2",
      evidenceCommentIds: ["comment-2"],
      frequency: 1,
      decision: "needs_more_evidence",
    });

    const projection = projectRunClustersToSignalMemory("run-2", [newBugCluster], [existingBugSignal], [], opts);

    expect(projection.signalsToUpdate).toHaveLength(1);
    expect(projection.signalsToUpdate[0].update.status).toBe("plan_ready");
  });

  it("creates separate plans for multiple strong signals", () => {
    const bugCluster = makeCluster({
      id: "bug-2",
      type: "bug",
      title: "Repeated bug reports detected",
      evidenceCommentIds: ["comment-1", "comment-2"],
      frequency: 2,
      severity: "high",
      decision: "propose_plan",
    });
    const featureCluster = makeCluster({
      id: "feature-3",
      type: "feature_request",
      title: "Repeated feature request detected",
      evidenceCommentIds: ["comment-3", "comment-4", "comment-5"],
      frequency: 3,
      severity: "medium",
      confidence: 0.9,
      decision: "propose_plan",
    });

    const projection = projectRunClustersToSignalMemory("run-strong", [bugCluster, featureCluster], [], [], opts);

    expect(projection.plansToCreate).toHaveLength(2);
    expect(projection.plansToCreate[0].signalId).not.toBe(projection.plansToCreate[1].signalId);
    expect(projection.plansToCreate.map((plan) => plan.signalId)).toEqual(["new-signal-run-strong-0", "new-signal-run-strong-1"]);
  });
});
