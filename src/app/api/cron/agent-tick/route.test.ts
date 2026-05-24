import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SignalGenRun } from "@/lib/types";

const mockFind = vi.fn();
const mockUpdateOne = vi.fn();
const mockGetHostedAgentConfig = vi.fn();
const mockCallHostedAgent = vi.fn();
const mockProcessAgentTick = vi.fn();

vi.mock("@/lib/agent-tick", () => ({
  processAgentTick: mockProcessAgentTick,
}));

vi.mock("@/lib/mongodb", () => ({
  getSignalGenDb: vi.fn(async () => ({
    collection: vi.fn(() => ({
      find: mockFind,
      updateOne: mockUpdateOne,
    })),
  })),
}));

vi.mock("@/lib/hosted-agent-client", () => ({
  getHostedAgentConfig: mockGetHostedAgentConfig,
  callHostedAgent: mockCallHostedAgent,
}));

const { GET } = await import("./route");

type DbRun = Omit<SignalGenRun, "_id"> & { _id: ObjectId };

function makeRun(id: string): DbRun {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    _id: new ObjectId(id),
    source: "dashboard_upload",
    status: "uploaded",
    createdAt: now,
    updatedAt: now,
    screenshotNames: ["feedback.png"],
    comments: ["The upload flow is confusing."],
    signal: {
      title: "Upload flow confusion",
      summary: "A user found the upload flow confusing.",
      confidence: 0.8,
      evidence: ["The upload flow is confusing."],
    },
    plan: {
      recommendedChange: "Clarify the upload flow.",
      filesToChange: ["src/app/dashboard/page.tsx"],
      guardrails: ["Keep processing founder-approved."],
      acceptanceCriteria: ["The agent cron can safely process the run."],
    },
  };
}

function mockPendingRuns(runs: DbRun[]) {
  const toArray = vi.fn(async () => runs);
  const limit = vi.fn(() => ({ toArray }));
  const sort = vi.fn(() => ({ limit }));
  mockFind.mockReturnValue({ sort });
  return { sort, limit, toArray };
}

function cronRequest(secret = "daily-secret") {
  return new Request("http://localhost/api/cron/agent-tick", {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` },
  });
}

describe("GET /api/cron/agent-tick", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "daily-secret");
    mockFind.mockReset();
    mockUpdateOne.mockReset();
    mockGetHostedAgentConfig.mockReset();
    mockCallHostedAgent.mockReset();
    mockProcessAgentTick.mockReset();
  });

  it("rejects requests without the Google Cloud Scheduler bearer token", async () => {
    const response = await GET(new Request("http://localhost/api/cron/agent-tick"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("rejects wrong bearer tokens and legacy private-header-only requests", async () => {
    const wrongBearer = await GET(
      new Request("http://localhost/api/cron/agent-tick", {
        headers: { Authorization: "Bearer wrong-secret" },
      }),
    );
    const legacyHeaderOnly = await GET(
      new Request("http://localhost/api/cron/agent-tick", {
        headers: { "x-cron-secret": "daily-secret" },
      }),
    );

    expect(wrongBearer.status).toBe(401);
    expect(legacyHeaderOnly.status).toBe(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("processes pending runs through the hosted Cloud Run worker when configured", async () => {
    const runA = makeRun("64f0c1f2a3b4c5d6e7f80901");
    const runB = makeRun("64f0c1f2a3b4c5d6e7f80902");
    const query = mockPendingRuns([runA, runB]);
    const hostedConfig = { url: "https://signalgen-agent.run.app/process-run", secret: "worker-secret" };
    mockGetHostedAgentConfig.mockReturnValue(hostedConfig);
    mockCallHostedAgent.mockImplementation(async (_config, runId: string) => ({
      ok: true,
      runtime: "google-cloud-adk",
      processedRunIds: [runId],
      processedCount: 1,
    }));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({ status: { $in: ["uploaded", "signal_detected"] } });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: 1 });
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(mockCallHostedAgent).toHaveBeenCalledTimes(2);
    expect(mockCallHostedAgent).toHaveBeenNthCalledWith(1, hostedConfig, "64f0c1f2a3b4c5d6e7f80901");
    expect(mockCallHostedAgent).toHaveBeenNthCalledWith(2, hostedConfig, "64f0c1f2a3b4c5d6e7f80902");
    expect(mockUpdateOne).not.toHaveBeenCalled();
    expect(body).toEqual({
      ok: true,
      mode: "hosted-worker",
      processedRunIds: ["64f0c1f2a3b4c5d6e7f80901", "64f0c1f2a3b4c5d6e7f80902"],
      processedCount: 2,
      checkedCount: 2,
    });
  });

  it("falls back to the local runtime when the hosted worker is not configured", async () => {
    const run = makeRun("64f0c1f2a3b4c5d6e7f80903");
    mockPendingRuns([run]);
    mockGetHostedAgentConfig.mockReturnValue(null);
    mockProcessAgentTick.mockResolvedValue({
      ok: true,
      processedRunIds: ["64f0c1f2a3b4c5d6e7f80903"],
      processedCount: 1,
    });

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockProcessAgentTick).toHaveBeenCalledWith(
      expect.objectContaining({
        listPendingRuns: expect.any(Function),
        updateRunAnalysis: expect.any(Function),
      }),
      { limit: 10 },
    );
    expect(mockCallHostedAgent).not.toHaveBeenCalled();
    expect(body).toEqual({
      ok: true,
      mode: "local-runtime",
      processedRunIds: ["64f0c1f2a3b4c5d6e7f80903"],
      processedCount: 1,
      checkedCount: 1,
    });
  });
});
