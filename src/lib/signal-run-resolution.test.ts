import { describe, expect, it } from "vitest";

import { findPrimarySignalIdForRun } from "./signal-run-resolution";
import type { ProductSignal, SignalGenRun } from "./types";

function run(overrides: Partial<SignalGenRun> = {}): SignalGenRun & { _id: string } {
  return {
    _id: "run-1",
    source: "dashboard_upload",
    status: "signal_detected",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    screenshotNames: [],
    comments: [],
    signal: {
      title: "Fix onboarding confusion",
      summary: "Users get stuck during onboarding.",
      confidence: 0.9,
      evidence: [],
    },
    signalClusters: [
      {
        id: "cluster-1",
        type: "friction",
        title: "Fix onboarding confusion",
        summary: "Users get stuck during onboarding.",
        evidenceCommentIds: ["comment-1"],
        severity: "high",
        frequency: 2,
        confidence: 0.9,
        decision: "propose_plan",
        rationale: "Repeated onboarding friction.",
      },
    ],
    plan: {
      recommendedChange: "Clarify onboarding.",
      filesToChange: [],
      guardrails: [],
      acceptanceCriteria: [],
    },
    ...overrides,
  };
}

function signal(overrides: Partial<ProductSignal> = {}): ProductSignal {
  return {
    _id: "signal-1",
    type: "friction",
    title: "Fix onboarding confusion",
    summary: "Users get stuck during onboarding.",
    signalKey: "friction:fix-onboarding-confusion",
    evidenceItemIds: ["evidence-1"],
    evidenceItems: [
      {
        id: "evidence-1",
        runId: "run-1",
        clusterType: "friction",
        title: "Fix onboarding confusion",
        summary: "Users get stuck during onboarding.",
        commentIds: ["comment-1"],
        frequency: 2,
        confidence: 0.9,
        severity: "high",
        decision: "propose_plan",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    strength: 3,
    confidence: 0.9,
    status: "accumulating",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("findPrimarySignalIdForRun", () => {
  it("prefers an exact normalized-title match over a stronger evidence-only match", () => {
    const result = findPrimarySignalIdForRun(
      run({ signal: { title: "  FIX Onboarding Confusion  ", summary: "", confidence: 0.9, evidence: [] } }),
      [
        signal({ _id: "signal-evidence-only", title: "Different title", strength: 99, updatedAt: "2026-02-01T00:00:00.000Z" }),
        signal({ _id: "signal-title-match", title: "fix onboarding confusion", strength: 1, updatedAt: "2026-01-01T00:00:00.000Z" }),
      ],
    );

    expect(result).toBe("signal-title-match");
  });

  it("falls back to an evidence runId match when no signal title matches", () => {
    const result = findPrimarySignalIdForRun(run(), [signal({ _id: "signal-by-evidence", title: "Different title" })]);

    expect(result).toBe("signal-by-evidence");
  });

  it("prefers type match, then highest strength, then newest update within the selected pool", () => {
    const result = findPrimarySignalIdForRun(run(), [
      signal({ _id: "signal-wrong-type-strong", type: "feature_request", strength: 99, updatedAt: "2026-04-01T00:00:00.000Z" }),
      signal({ _id: "signal-type-match-weaker", type: "friction", strength: 2, updatedAt: "2026-02-01T00:00:00.000Z" }),
      signal({ _id: "signal-type-match-stronger-older", type: "friction", strength: 4, updatedAt: "2026-01-01T00:00:00.000Z" }),
      signal({ _id: "signal-type-match-stronger-newer", type: "friction", strength: 4, updatedAt: "2026-03-01T00:00:00.000Z" }),
    ]);

    expect(result).toBe("signal-type-match-stronger-newer");
  });

  it("does not resolve a signal that only has legacy signal.runId without evidence for the run", () => {
    const result = findPrimarySignalIdForRun(run(), [
      signal({
        _id: "legacy-run-only-signal",
        runId: "run-1",
        evidenceItems: [
          {
            id: "evidence-other",
            runId: "run-2",
            clusterType: "friction",
            title: "Fix onboarding confusion",
            summary: "Users get stuck during onboarding.",
            commentIds: ["comment-2"],
            frequency: 1,
            confidence: 0.7,
            severity: "medium",
            decision: "propose_plan",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    ]);

    expect(result).toBeUndefined();
  });

  it("returns undefined when no signal evidence references the run", () => {
    const result = findPrimarySignalIdForRun(run(), [
      signal({
        _id: "signal-other-run",
        evidenceItems: [
          {
            id: "evidence-other",
            runId: "run-2",
            clusterType: "friction",
            title: "Fix onboarding confusion",
            summary: "Users get stuck during onboarding.",
            commentIds: ["comment-2"],
            frequency: 1,
            confidence: 0.7,
            severity: "medium",
            decision: "propose_plan",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    ]);

    expect(result).toBeUndefined();
  });
});
