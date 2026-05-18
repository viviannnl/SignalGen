import { describe, expect, it } from "vitest";

import { applyFounderDecision, FounderDecisionError } from "./founder-decision";
import type { SignalGenRun } from "./types";

function makePlanReadyRun(overrides: Partial<SignalGenRun> = {}): SignalGenRun {
  const now = "2026-01-01T00:00:00.000Z";

  return {
    _id: "run-1",
    source: "dashboard_upload",
    status: "plan_ready",
    createdAt: now,
    updatedAt: now,
    screenshotNames: ["feedback.png"],
    comments: ["Can you add Slack integration?"],
    signal: {
      title: "Repeated feature request detected",
      summary: "3 related comments classified as feature request.",
      confidence: 0.91,
      evidence: ["Can you add Slack integration?"],
    },
    plan: {
      recommendedChange: "Draft a small, reviewable product improvement.",
      filesToChange: ["Product UI/content file to be selected after founder approval"],
      guardrails: ["No code changes before founder approval."],
      acceptanceCriteria: ["Founder approval is captured before any repo edit or PR."],
    },
    ...overrides,
  };
}

describe("applyFounderDecision", () => {
  it("approves a plan-ready run and records founder decision metadata", () => {
    const update = applyFounderDecision(makePlanReadyRun(), {
      action: "approve",
      note: "Looks good. Keep it small.",
      decidedBy: "dashboard_founder",
      now: "2026-01-02T00:00:00.000Z",
    });

    expect(update.status).toBe("approved");
    expect(update.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(update.founderDecision).toEqual({
      action: "approve",
      note: "Looks good. Keep it small.",
      decidedAt: "2026-01-02T00:00:00.000Z",
      decidedBy: "dashboard_founder",
    });
  });

  it("rejects a plan-ready run and records founder decision metadata", () => {
    const update = applyFounderDecision(makePlanReadyRun(), {
      action: "reject",
      note: "Not enough priority right now.",
      decidedBy: "dashboard_founder",
      now: "2026-01-02T00:00:00.000Z",
    });

    expect(update.status).toBe("rejected");
    expect(update.founderDecision?.action).toBe("reject");
    expect(update.founderDecision?.note).toBe("Not enough priority right now.");
  });

  it("refuses to decide runs that are not plan-ready", () => {
    expect(() =>
      applyFounderDecision(makePlanReadyRun({ status: "uploaded" }), {
        action: "approve",
        decidedBy: "dashboard_founder",
        now: "2026-01-02T00:00:00.000Z",
      }),
    ).toThrow(new FounderDecisionError("Only plan-ready runs can be approved or rejected.", 409));
  });

  it("rejects invalid decision actions", () => {
    expect(() =>
      applyFounderDecision(makePlanReadyRun(), {
        action: "maybe" as "approve",
        decidedBy: "dashboard_founder",
        now: "2026-01-02T00:00:00.000Z",
      }),
    ).toThrow(new FounderDecisionError("Decision action must be approve or reject.", 400));
  });

  it("rejects non-string decision notes", () => {
    expect(() =>
      applyFounderDecision(makePlanReadyRun(), {
        action: "approve",
        note: 123 as unknown as string,
        decidedBy: "dashboard_founder",
        now: "2026-01-02T00:00:00.000Z",
      }),
    ).toThrow(new FounderDecisionError("Decision note must be text.", 400));
  });

  it("rejects decision notes over 1000 characters", () => {
    expect(() =>
      applyFounderDecision(makePlanReadyRun(), {
        action: "approve",
        note: "x".repeat(1001),
        decidedBy: "dashboard_founder",
        now: "2026-01-02T00:00:00.000Z",
      }),
    ).toThrow(new FounderDecisionError("Decision note must be 1000 characters or fewer.", 400));
  });
});
