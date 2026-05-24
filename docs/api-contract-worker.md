# SignalGen Worker API Contract

## Overview

The SignalGen agent worker is a hosted service (Google Cloud Run) that processes MongoDB feedback runs using Gemini AI.

**Service:** `signalgen-agent`  
**Runtime:** Google Cloud Run  
**URL:** `https://signalgen-agent-kcbkl7rb6q-uc.a.run.app`

---

## Endpoints

### GET /health

Health check. No authentication required.

**Response (200):**
```json
{
  "ok": true,
  "service": "signalgen-agent",
  "runtime": "google-cloud-adk"
}
```

---

### POST /process-run

Process one pending MongoDB run by ID.

**Authentication:** HTTP `Authorization` header using the bearer scheme and the shared worker secret is required.

**Request body:**
```json
{
  "runId": "<MongoDB ObjectId string>"
}
```

**Success response (200):**
```json
{
  "ok": true,
  "runtime": "google-cloud-adk",
  "processedRunIds": ["<runId>"],
  "processedCount": 1
}
```

**Error responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Missing or invalid Authorization header | `{"ok":false,"error":"Unauthorized"}` |
| 400 | Missing runId | `{"ok":false,"error":"runId is required"}` |
| 400 | Invalid runId (not a valid MongoDB ObjectId) | `{"ok":false,"error":"Invalid runId format"}` |
| 404 | Run not found or already processed | `{"ok":false,"error":"Run not found"}` |
| 500 | Worker misconfigured (`AGENT_WORKER_SECRET` not set) | `{"ok":false,"error":"Agent worker is misconfigured"}` |
| 500 | Unexpected processing error | `{"ok":false,"error":"Internal server error"}` |

---

## Authentication model

The Dashboard (Vercel) and the Worker (Cloud Run) share a secret string via environment variable:

- Vercel: `AGENT_WORKER_SECRET` env var
- Cloud Run: `AGENT_WORKER_SECRET` env var (from Google Secret Manager)

The dashboard sends an HTTP `Authorization` header using the bearer scheme. The worker compares the bearer value with its own `AGENT_WORKER_SECRET`. This is a shared-secret model, not OAuth.

---

## Idempotency

`POST /process-run` is idempotent for the same `runId` if the run has already been processed (status is not `uploaded` or `signal_detected`). In that case, the worker returns 404 ("Run not found") because the MongoDB query filters for pending runs only. Calling it again after a run is processed is safe — it will return 404, not double-process.

---

## Dashboard client

`src/lib/hosted-agent-client.ts` provides `callHostedAgent(config, runId)` for calling this endpoint from Vercel. See also `src/lib/hosted-agent-client.test.ts` for client-level tests.
