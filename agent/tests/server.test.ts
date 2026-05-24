import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import http from "http";
import { ObjectId } from "mongodb";

vi.mock("../src/tools/runs.js", () => ({
  getRun: vi.fn(),
  updateRunWithAnalysis: vi.fn().mockResolvedValue({ updated: true, runId: "test-run-id" }),
  closeMongoClient: vi.fn().mockResolvedValue(undefined),
  listPendingRuns: vi.fn(),
}));

vi.mock("../src/tools/signals.js", () => ({
  analyzeRun: vi.fn(),
  classifyComment: vi.fn(),
  decideCluster: vi.fn(),
}));

import { createServer } from "../src/server.js";
import { closeMongoClient, getRun, updateRunWithAnalysis } from "../src/tools/runs.js";
import { analyzeRun } from "../src/tools/signals.js";
import type { ProcessRunResult, SignalGenRun } from "../src/schemas.js";

function makeRequest(
  options: http.RequestOptions,
  body?: string,
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        try {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString()),
          });
        } catch {
          reject(new Error("Failed to parse response JSON"));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        port = address.port;
      }
      resolve();
    });
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  await closeMongoClient();
});

describe("GET /health", () => {
  it("returns 200 with service info", async () => {
    const response = await makeRequest({ hostname: "127.0.0.1", port, path: "/health", method: "GET" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ ok: true, service: "signalgen-agent", runtime: "google-cloud-adk" });
  });
});

describe("POST /process-run", () => {
  it("returns 500 when the worker secret is not configured", async () => {
    vi.stubEnv("AGENT_WORKER_SECRET", "");

    const response = await makeRequest(
      { hostname: "127.0.0.1", port, path: "/process-run", method: "POST", headers: { "Content-Type": "application/json" } },
      JSON.stringify({ runId: new ObjectId().toHexString() }),
    );

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ ok: false, error: "Agent worker is misconfigured" });
    expect(getRun).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is missing", async () => {
    vi.stubEnv("AGENT_WORKER_SECRET", "test-secret");

    const response = await makeRequest(
      { hostname: "127.0.0.1", port, path: "/process-run", method: "POST", headers: { "Content-Type": "application/json" } },
      JSON.stringify({ runId: new ObjectId().toHexString() }),
    );

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ ok: false, error: "Unauthorized" });
    expect(getRun).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header has wrong token", async () => {
    vi.stubEnv("AGENT_WORKER_SECRET", "test-secret");

    const response = await makeRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/process-run",
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer wrong-token" },
      },
      JSON.stringify({ runId: new ObjectId().toHexString() }),
    );

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ ok: false, error: "Unauthorized" });
    expect(getRun).not.toHaveBeenCalled();
  });

  it("returns 400 when runId is missing from body", async () => {
    vi.stubEnv("AGENT_WORKER_SECRET", "test-secret");

    const response = await makeRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/process-run",
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" },
      },
      JSON.stringify({}),
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ ok: false, error: "runId is required" });
    expect(getRun).not.toHaveBeenCalled();
  });

  it("returns 400 when runId has invalid ObjectId format", async () => {
    vi.stubEnv("AGENT_WORKER_SECRET", "test-secret");

    const response = await makeRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/process-run",
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" },
      },
      JSON.stringify({ runId: "not-an-object-id" }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ ok: false, error: "Invalid runId format" });
    expect(getRun).not.toHaveBeenCalled();
  });

  it("returns 404 when run is not found", async () => {
    vi.stubEnv("AGENT_WORKER_SECRET", "test-secret");
    const runId = new ObjectId().toHexString();
    vi.mocked(getRun).mockResolvedValue(null);

    const response = await makeRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/process-run",
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" },
      },
      JSON.stringify({ runId }),
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ ok: false, error: "Run not found" });
    expect(getRun).toHaveBeenCalledWith(runId);
    expect(analyzeRun).not.toHaveBeenCalled();
  });

  it("returns 200 with processedRunIds on successful analysis", async () => {
    vi.stubEnv("AGENT_WORKER_SECRET", "test-secret");
    const runId = new ObjectId().toHexString();
    const run: SignalGenRun = { _id: runId, status: "uploaded", comments: ["Please add export support"] };
    const analysisResult: ProcessRunResult = {
      runId,
      status: "plan_ready",
      comments: ["Please add export support"],
      signalClusters: [],
    };
    vi.mocked(getRun).mockResolvedValue(run);
    vi.mocked(analyzeRun).mockResolvedValue(analysisResult);

    const response = await makeRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/process-run",
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" },
      },
      JSON.stringify({ runId }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      runtime: "google-cloud-adk",
      processedRunIds: [runId],
      processedCount: 1,
    });
    expect(getRun).toHaveBeenCalledWith(runId);
    expect(analyzeRun).toHaveBeenCalledWith(run);
    expect(updateRunWithAnalysis).toHaveBeenCalledWith(analysisResult);
  });
});
