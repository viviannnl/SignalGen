import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImplementationRecord, SignalGenRun } from "@/lib/types";

const mockFindOne = vi.fn();
const mockFindOneAndUpdate = vi.fn();

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: mockFindOne,
      findOneAndUpdate: mockFindOneAndUpdate,
    })),
  })),
}));

vi.mock("@/lib/implementation-job", async () => import("../../../../../lib/implementation-job"));

const { POST } = await import("./route");

type DbRun = Omit<SignalGenRun, "_id"> & { _id: ObjectId };

function makeRun(overrides: Partial<SignalGenRun> = {}): DbRun {
  const now = "2026-01-01T00:00:00.000Z";
  const { _id: _ignoredId, ...runOverrides } = overrides;

  return {
    _id: new ObjectId("64f0c1f2a3b4c5d6e7f80901"),
    source: "dashboard_upload",
    workspaceId: "demo",
    status: "approved",
    createdAt: now,
    updatedAt: now,
    screenshotNames: ["feedback.png"],
    comments: ["Please add Slack notifications.", "Slack alerts would help."],
    repoConnectionId: "repo-123",
    signal: {
      title: "Slack notifications requested",
      summary: "Multiple users asked for Slack alerts.",
      confidence: 0.92,
      evidence: ["Please add Slack notifications.", "Slack alerts would help."],
    },
    plan: {
      recommendedChange: "Add a scoped Slack notifications plan.",
      filesToChange: ["src/app/dashboard/page.tsx"],
      guardrails: ["No code changes before founder approval."],
      acceptanceCriteria: ["Founder-approved plan is preserved."],
    },
    founderDecision: {
      action: "approve",
      note: "Proceed safely.",
      decidedAt: "2026-01-02T00:00:00.000Z",
      decidedBy: "dashboard_founder",
    },
    ...runOverrides,
  };
}

async function postImplement(runId = "64f0c1f2a3b4c5d6e7f80901") {
  return POST(new Request(`http://localhost/api/runs/${runId}/implement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoConnectionId: "repo-123" }),
  }), {
    params: Promise.resolve({ runId }),
  });
}

describe("POST /api/runs/[runId]/implement", () => {
  beforeEach(() => {
    mockFindOne.mockReset();
    mockFindOneAndUpdate.mockReset();
  });

  it("returns 404 when the run does not exist", async () => {
    mockFindOne.mockResolvedValue(null);

    const response = await postImplement();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Run not found.");
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when the run is not founder-approved", async () => {
    mockFindOne.mockResolvedValue(makeRun({ status: "uploaded", founderDecision: undefined }));

    const response = await postImplement();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Implementation requires founder approval.");
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 when the run already has an implementation job", async () => {
    const existingImplementation: ImplementationRecord = {
      status: "queued",
      summary: "Existing guarded implementation job.",
      branchName: "signalgen/existing-job",
      guardrails: ["No direct pushes."],
      createdAt: "2026-01-03T00:00:00.000Z",
      createdBy: "dashboard_founder",
      updatedAt: "2026-01-03T00:00:00.000Z",
    };
    mockFindOne.mockResolvedValue(makeRun({ implementation: existingImplementation }));

    const response = await postImplement();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("Implementation already exists for this run.");
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("creates a queued simulated implementation job for an approved run", async () => {
    const approvedRun = makeRun();
    mockFindOne.mockResolvedValue(approvedRun);
    mockFindOneAndUpdate.mockImplementation(async (_filter, update) => ({
      ...approvedRun,
      ...update.$set,
    }));

    const response = await postImplement();
    const body = (await response.json()) as { implementation?: ImplementationRecord };

    expect(response.status).toBe(200);
    expect(body.implementation?.status).toBe("queued");
    expect(body.implementation?.branchName).toBe("signalgen/64f0c1f2a3b4c5d6e7f80901-slack-notifications-requested");
    expect(body.implementation?.prDraft).toBeUndefined();
    expect(JSON.stringify(body.implementation)).not.toContain("github.com");
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: approvedRun._id, workspaceId: "demo", repoConnectionId: "repo-123", status: "approved", implementation: { $exists: false } },
      {
        $set: expect.objectContaining({
          status: "pr_created",
          implementation: expect.objectContaining({ status: "queued" }),
          updatedAt: expect.any(String),
        }),
      },
      { returnDocument: "after" },
    );
  });
});
