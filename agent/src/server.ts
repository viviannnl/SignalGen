import "dotenv/config";
import http from "http";
import { fileURLToPath } from "url";
import { ObjectId } from "mongodb";
import { analyzeRun } from "./tools/signals.js";
import { closeMongoClient, getRun, updateRunWithAnalysis } from "./tools/runs.js";
import type { ProcessRunResult } from "./schemas.js";

const RUNTIME = "google-cloud-adk";
const SERVICE = "signalgen-agent";

type JsonResponse = Record<string, unknown>;

function readBody(req: import("http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function writeJson(res: http.ServerResponse, statusCode: number, body: JsonResponse): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function getBearerToken(req: http.IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

async function handleProcessRun(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const workerSecret = process.env.AGENT_WORKER_SECRET;
  if (!workerSecret) {
    console.warn("[signalgen-agent] AGENT_WORKER_SECRET is not configured");
    writeJson(res, 500, { ok: false, error: "Agent worker is misconfigured" });
    return;
  }

  if (getBearerToken(req) !== workerSecret) {
    writeJson(res, 401, { ok: false, error: "Unauthorized" });
    return;
  }

  const bodyText = await readBody(req);
  let body: unknown;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = {};
  }

  const runId = typeof body === "object" && body !== null && "runId" in body ? (body as { runId?: unknown }).runId : undefined;
  if (typeof runId !== "string" || !runId) {
    writeJson(res, 400, { ok: false, error: "runId is required" });
    return;
  }

  if (!ObjectId.isValid(runId)) {
    writeJson(res, 400, { ok: false, error: "Invalid runId format" });
    return;
  }

  const run = await getRun(runId);
  if (!run) {
    writeJson(res, 404, { ok: false, error: "Run not found" });
    return;
  }

  let result: ProcessRunResult;
  try {
    result = await analyzeRun(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[signalgen-agent] analysis failed for run", runId, error);
    await updateRunWithAnalysis({ runId, status: "failed", processingError: message });
    writeJson(res, 500, { ok: false, error: "Analysis failed" });
    return;
  }
  await updateRunWithAnalysis(result);

  writeJson(res, 200, {
    ok: true,
    runtime: RUNTIME,
    processedRunIds: [runId],
    processedCount: 1,
  });
}

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/health") {
        writeJson(res, 200, { ok: true, service: SERVICE, runtime: RUNTIME });
        return;
      }

      if (req.method === "POST" && url.pathname === "/process-run") {
        await handleProcessRun(req, res);
        return;
      }

      writeJson(res, 404, { ok: false, error: "Not found" });
    })().catch((error: unknown) => {
      console.error("[signalgen-agent] request failed", error);
      if (!res.headersSent) {
        writeJson(res, 500, { ok: false, error: "Internal server error" });
      } else {
        res.end();
      }
    });
  });
}

export function startServer(port: number | string): http.Server {
  const server = createServer();
  server.listen(port, () => {
    console.log(`[signalgen-agent] listening on port ${port}`);
  });

  process.on("SIGTERM", async () => {
    await closeMongoClient();
    server.close(() => process.exit(0));
  });

  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer(process.env.PORT ?? 8080);
}
