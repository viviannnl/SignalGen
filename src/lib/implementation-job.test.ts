import { describe, expect, it } from "vitest";

import { createImplementationJob, ImplementationJobError, prepareImplementationPrDraft } from "./implementation-job";
import type { SignalGenRun } from "./types";

function makeApprovedRun(overrides: Partial<SignalGenRun> = {}): SignalGenRun {
  const now = "2026-01-01T00:00:00.000Z";

  return {
    _id: "run-1",
    source: "dashboard_upload",
    status: "approved",
    createdAt: now,
    updatedAt: now,
    screenshotNames: ["feedback.png"],
    comments: ["Can you add Slack integration?", "We need Slack alerts.", "Would love Slack notifications."],
    signal: {
      title: "Repeated feature request detected",
      summary: "3 related comments classified as feature request.",
      confidence: 0.91,
      evidence: ["Can you add Slack integration?", "We need Slack alerts.", "Would love Slack notifications."],
    },
    plan: {
      recommendedChange: "Draft a small, reviewable product improvement for Slack notifications.",
      filesToChange: ["Product UI/content file to be selected after founder approval"],
      guardrails: ["No code changes before founder approval.", "Create a branch and PR instead of pushing directly to main."],
      acceptanceCriteria: ["Plan cites feedback comments.", "Build/tests pass before PR."],
    },
    founderDecision: {
      action: "approve",
      note: "Proceed, but keep it scoped.",
      decidedAt: "2026-01-02T00:00:00.000Z",
      decidedBy: "dashboard_founder",
    },
    ...overrides,
  };
}

describe("createImplementationJob", () => {
  it("creates a queued guarded implementation job for approved runs", () => {
    const update = createImplementationJob(makeApprovedRun(), {
      now: "2026-01-03T00:00:00.000Z",
      createdBy: "dashboard_founder",
    });

    expect(update.implementation?.status).toBe("queued");
    expect(update.implementation?.branchName).toBe("signalgen/run-1-repeated-feature-request-detected");
    expect(update.implementation?.createdAt).toBe("2026-01-03T00:00:00.000Z");
    expect(update.implementation?.guardrails).toContain("No code changes before founder approval.");
    expect(update.implementation?.summary).toContain("Repeated feature request detected");
  });

  it("returns the existing implementation job without duplicating it", () => {
    const existing = createImplementationJob(makeApprovedRun(), {
      now: "2026-01-03T00:00:00.000Z",
      createdBy: "dashboard_founder",
    }).implementation;

    const update = createImplementationJob(makeApprovedRun({ implementation: existing }), {
      now: "2026-01-04T00:00:00.000Z",
      createdBy: "dashboard_founder",
    });

    expect(update.implementation).toEqual(existing);
    expect(update.updatedAt).toBe("2026-01-04T00:00:00.000Z");
  });

  it("blocks implementation jobs for runs that are not approved", () => {
    expect(() =>
      createImplementationJob(makeApprovedRun({ status: "plan_ready", founderDecision: undefined }), {
        now: "2026-01-03T00:00:00.000Z",
        createdBy: "dashboard_founder",
      }),
    ).toThrow(new ImplementationJobError("Only approved runs can start guarded implementation.", 409));
  });
});

describe("prepareImplementationPrDraft", () => {
  it("turns a queued implementation job into a ready-for-PR draft", () => {
    const queued = createImplementationJob(makeApprovedRun(), {
      now: "2026-01-03T00:00:00.000Z",
      createdBy: "dashboard_founder",
    }).implementation;

    const update = prepareImplementationPrDraft(makeApprovedRun({ implementation: queued }), {
      now: "2026-01-04T00:00:00.000Z",
    });

    expect(update.implementation?.status).toBe("ready_for_pr");
    expect(update.implementation?.prDraft?.title).toBe("Implement: Repeated feature request detected");
    expect(update.implementation?.prDraft?.branchName).toBe("signalgen/run-1-repeated-feature-request-detected");
    expect(update.implementation?.prDraft?.filesToInspect).toEqual(["Product UI/content file to be selected after founder approval"]);
    expect(update.implementation?.prDraft?.testCommands).toEqual(["npm test", "npm run lint", "npm run build"]);
    expect(update.implementation?.prDraft?.body).toContain("Evidence");
    expect(update.implementation?.prDraft?.checklist).toContain("Run build/tests before marking the PR ready for review.");
  });

  it("blocks PR draft preparation without a queued implementation job", () => {
    expect(() =>
      prepareImplementationPrDraft(makeApprovedRun(), {
        now: "2026-01-04T00:00:00.000Z",
      }),
    ).toThrow(new ImplementationJobError("A queued implementation job is required before preparing a PR draft.", 409));
  });
});
