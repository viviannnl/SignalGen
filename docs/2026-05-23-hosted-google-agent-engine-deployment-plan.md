# Hosted Google Agent Engine Deployment Implementation Plan

> **For Hermes:** Use `subagent-driven-development` skill to implement this plan task-by-task. Follow `code-change-workflow` for every code change. Do not deploy to Google Cloud, change production secrets, or update production Vercel environment variables without explicit user approval.

**Goal:** Move SignalGen from an integrated Vercel/Next.js agent runtime to a hosted Google Cloud agent runtime, starting with the ADK TypeScript Cloud Run deployment path and keeping the architecture ready for direct Gemini Enterprise Agent Platform / Agent Engine deployment when that path is stable for this setup.

**Architecture:** The current dashboard flow is `Vercel/Next.js dashboard → /api/agent/tick → local integrated agent runtime adapter → Gemini + MongoDB`. The target flow is `Vercel/Next.js dashboard → /api/agent/tick → hosted Google Cloud ADK agent service → Gemini + MongoDB + optional GitHub tools`. Use Cloud Run as the practical first hosted runtime because the installed ADK TypeScript CLI exposes `adk deploy cloud_run`; keep the endpoint contract narrow so the hosted worker can later be replaced by a direct Agent Engine endpoint.

**Tech Stack:** Next.js App Router, Google ADK TypeScript (`@google/adk`), Cloud Run, Gemini API, MongoDB Node driver, Vercel environment variables, Google Secret Manager, optional Cloud Scheduler and GitHub/Vercel APIs.

---

## Current state

SignalGen already has:

- Next.js dashboard and API route:
  - `src/app/api/agent/tick/route.ts`
- Shared agent tick orchestration:
  - `src/lib/agent-tick.ts`
- Integrated Gemini runtime adapter:
  - `src/lib/adk-agent-runtime.ts`
- Standalone ADK TypeScript agent package:
  - `agent/package.json`
  - `agent/src/agent.ts`
  - `agent/src/tools/signals.ts`
  - `agent/src/tools/runs.ts`
  - `agent/src/tools/memoryMcp.ts`
  - `agent/src/tools/github.ts`

Current local/integrated flow:

```txt
/api/agent/tick
→ MongoDB runs collection
→ pendingRunQuery(status in ["uploaded", "signal_detected"])
→ processAgentTick(...)
→ signalGenAdkRuntime.analyzeRun(...)
→ update MongoDB
```

Known deployment risk:

```txt
agent/src/tools/signals.ts imports from ../../../src/lib/adk-agent-runtime.js
agent/src/tools/signals.ts imports from ../../../src/lib/types.js
```

That is fine locally, but risky for hosted deployment because the ADK deploy step may package only the `agent/` directory. The hosted agent package should become self-contained or depend on an explicit shared module.

---

## Target hosted contract

The dashboard should be able to call a hosted worker with this minimal contract:

```http
POST https://signalgen-agent-xxxxx.run.app/process-run
Authorization: Bearer <AGENT_WORKER_SECRET>
Content-Type: application/json

{
  "runId": "mongo-run-id"
}
```

Expected response:

```json
{
  "ok": true,
  "runtime": "google-cloud-adk",
  "processedRunIds": ["mongo-run-id"],
  "processedCount": 1
}
```

Vercel should use local fallback when the hosted worker is not configured:

```txt
If AGENT_WORKER_URL exists:
  call hosted Google agent worker.
Else:
  use local integrated runtime adapter.
```

Suggested environment variables:

```txt
AGENT_WORKER_URL=https://signalgen-agent-xxxxx.run.app/process-run
AGENT_WORKER_SECRET=<shared secret between Vercel and Cloud Run>
```

---

## Milestone A: Hosted agent health check

**Objective:** Deploy the smallest safe hosted Google Cloud agent endpoint and prove Cloud Run is reachable.

**Files:**

- Modify or create: `agent/src/server.ts`
- Modify: `agent/package.json`
- Optional: `agent/src/config.ts`
- Test: `agent/tests/server.test.ts` or equivalent

**Behavior:**

Expose a health endpoint that returns:

```json
{
  "ok": true,
  "service": "signalgen-agent",
  "runtime": "google-cloud-adk"
}
```

**Implementation notes:**

- Keep secrets out of the response.
- Bind to `process.env.PORT` for Cloud Run compatibility.
- Return a clear error only for internal logs, not to users.

**Verification:**

Local:

```bash
cd /Users/vivianli/projects/SignalGen/agent
npm run typecheck
npm test
```

Hosted, after explicit deploy approval:

```bash
gcloud run services describe signalgen-agent \
  --region us-central1 \
  --project signalgen-496700

curl -sS https://<cloud-run-url>/health
```

Expected:

```json
{"ok":true,"service":"signalgen-agent","runtime":"google-cloud-adk"}
```

**Success criteria:**

1. Cloud Run URL responds.
2. Google Cloud logs show startup and health requests.
3. No secrets are exposed.
4. Agent package typecheck/tests pass.

---

## Milestone B: Hosted agent can process one run

**Objective:** Add `POST /process-run` so the hosted agent can process exactly one MongoDB run by ID.

**Files:**

- Modify: `agent/src/server.ts`
- Modify or create: `agent/src/processRun.ts`
- Modify: `agent/src/tools/runs.ts`
- Modify: `agent/src/tools/signals.ts`
- Test: `agent/tests/process-run.test.ts`

**Behavior:**

Input:

```json
{
  "runId": "..."
}
```

Processing steps:

1. Validate `Authorization: Bearer <AGENT_WORKER_SECRET>`.
2. Validate that `runId` is present and a valid MongoDB ObjectId.
3. Load the run from MongoDB.
4. Analyze comments with Gemini or fallback logic.
5. Update the MongoDB run with signal clusters, top signal, plan, status, and timestamp.
6. Return processed result.

**Expected statuses:**

```txt
plan_ready
needs_review
insufficient_evidence
```

**Verification:**

```bash
cd /Users/vivianli/projects/SignalGen/agent
npm run typecheck
npm test
```

Manual smoke test after deploy:

```bash
curl -sS -X POST https://<cloud-run-url>/process-run \
  -H "Authorization: Bearer $AGENT_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"runId":"<test-run-id>"}'
```

Expected shape:

```json
{
  "ok": true,
  "runtime": "google-cloud-adk",
  "processedRunIds": ["<test-run-id>"],
  "processedCount": 1
}
```

**Success criteria:**

1. Hosted worker rejects missing/wrong secret with HTTP 401.
2. Hosted worker rejects invalid `runId` with HTTP 400.
3. Hosted worker returns HTTP 404 for missing run.
4. Hosted worker updates one pending run in MongoDB.
5. Dashboard history reflects the updated run after refresh.
6. Agent package tests cover success and failure paths.

---

## Milestone C: Vercel dashboard calls hosted agent

**Objective:** Update `/api/agent/tick` so the dashboard triggers the hosted Google agent when `AGENT_WORKER_URL` is configured, while preserving local fallback.

**Files:**

- Modify: `src/app/api/agent/tick/route.ts`
- Create or modify: `src/lib/hosted-agent-client.ts`
- Test: `src/lib/hosted-agent-client.test.ts`
- Test: route tests if current test harness supports route testing

**Behavior:**

Pseudo-flow:

```ts
if (process.env.AGENT_WORKER_URL) {
  return callHostedAgent({ runId });
}

return processAgentTick(store, { limit: 5, runId });
```

Suggested fetch shape:

```ts
await fetch(process.env.AGENT_WORKER_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.AGENT_WORKER_SECRET}`,
  },
  body: JSON.stringify({ runId }),
});
```

**Important guardrail:**

- If `AGENT_WORKER_URL` is configured but `AGENT_WORKER_SECRET` is missing, return a clear server configuration error rather than silently falling back.
- Do not expose the secret in frontend code or API responses.

**Verification:**

Root app:

```bash
cd /Users/vivianli/projects/SignalGen
npm test
npm run lint
npm run build
```

Manual production-like test after environment variables are configured:

```txt
Upload feedback in Vercel dashboard
→ click/run agent tick
→ Vercel calls Google-hosted agent
→ dashboard refresh shows agent result
```

**Success criteria:**

1. Without `AGENT_WORKER_URL`, existing local integrated behavior still works.
2. With `AGENT_WORKER_URL`, `/api/agent/tick` calls the hosted worker.
3. Hosted worker response is passed through in a dashboard-compatible shape.
4. Errors are understandable but do not leak secrets.
5. Upload → tick → dashboard result works through Vercel + Cloud Run.

---

## Milestone D: Add Cloud Scheduler for periodic processing

**Objective:** Make SignalGen event-driven/periodic instead of manually prompt-driven by adding a scheduled trigger for pending runs.

**Files:**

- Create: `docs/cloud-scheduler-setup.md`
- Optional modify: `src/app/api/agent/tick/route.ts` if a scheduler-specific auth header is needed
- Optional create: `src/lib/scheduler-auth.ts`
- Tests for scheduler auth if implemented

**Target flow:**

```txt
Cloud Scheduler
→ POST /api/agent/tick or hosted agent endpoint
→ process pending runs
→ MongoDB stores updated signals/plans
→ dashboard displays latest memory chain
```

**Implementation notes:**

- Prefer calling `/api/agent/tick` first so Vercel remains the control-plane entrypoint.
- Use a scheduler secret header if the endpoint is public.
- Keep manual dashboard trigger available for demos.

**Verification:**

```bash
gcloud scheduler jobs describe signalgen-agent-tick \
  --location us-central1 \
  --project signalgen-496700
```

Manual trigger:

```bash
gcloud scheduler jobs run signalgen-agent-tick \
  --location us-central1 \
  --project signalgen-496700
```

**Success criteria:**

1. Scheduler can trigger processing without a user clicking a button.
2. Pending uploaded runs are processed periodically.
3. Logs show scheduled calls.
4. Dashboard history updates after scheduled processing.
5. Manual dashboard trigger still works.

---

## Milestone E: Optional PR automation after hosted analysis is stable

**Objective:** After hosted analysis works reliably, add guarded GitHub PR automation for approved runs.

**Files:**

- Modify or create: `agent/src/tools/github.ts`
- Modify or create: implementation job processor files in app or agent package
- Tests around approval-only behavior and guardrails

**Target flow:**

```txt
approved run
→ hosted agent prepares branch/PR draft
→ optional guarded repo edit/build step
→ GitHub PR created
→ MongoDB stores PR link
→ dashboard displays PR and Vercel preview link
```

**Guardrails:**

- Founder approval required before GitHub action.
- No direct push to `main`.
- No edits to secrets, billing, auth, or infrastructure files.
- Build/tests must run before PR creation when real code edits are enabled.

**Success criteria:**

1. Non-approved runs cannot create PRs.
2. Approved runs create or prepare exactly one PR action record.
3. Dashboard shows branch, PR title/body, status, and link.
4. MongoDB stores the full decision-to-PR chain.
5. Any real repo mutation stays behind explicit approval.

---

## Product feedback captured from manual user testing

Vivian manually tested SignalGen as a user and reported these findings. These are intentionally parked in this plan so the hosted-engine milestone stays first, while future product work is not lost.

### Feedback item 1: Drag-and-drop upload does not actually work

**Observed behavior:** The UI says `Drop or choose screenshots`, but dropping screenshots onto the upload card does not select/upload files. Using the file-picker button works.

**Current code evidence:** `src/app/dashboard/page.tsx` uses a styled `<label>` with a hidden file input and an `onChange` handler. There are no explicit `onDragOver`, `onDragLeave`, or `onDrop` handlers on the drop zone.

**Expected behavior:** Users should be able to drag PNG/JPG/WebP screenshots onto the upload card, see the selected filenames, and then click `Upload and run agent`.

**Future fix milestone:** Add first-class drag/drop handling, visual drag-over state, tests for file selection, and manual browser verification.

### Feedback item 2: Screenshot extraction says no customer comments found

**Observed behavior:** Uploading some screenshots returns: `No customer feedback comments were found in the uploaded screenshots.`

**Current processing path:**

```txt
src/app/dashboard/page.tsx
→ POST /api/runs with multipart FormData field "screenshots"
→ src/app/api/runs/route.ts
→ fileToScreenshot(...)
→ src/lib/gemini-extraction.ts
→ Gemini model gemini-2.5-flash
→ prompt asks for only visible user/customer feedback comments
→ JSON is parsed from {"comments":[...]}
→ if comments.length === 0, API returns the no-comments error
```

**Current extraction constraints:**

- Accepts only PNG, JPG, and WebP.
- Max 5 screenshots per run.
- Max 4 MB per image.
- Max 8 MB total upload.
- Checks real image signatures, not just file extension/MIME type.
- Does not store raw screenshot image bytes in MongoDB; it stores screenshot names plus extracted comments.
- Asks Gemini to ignore navigation, usernames, timestamps, buttons, ads, and unrelated UI chrome.
- Throws immediately if Gemini returns an empty comments array.

**Likely cause from this specific manual test:** The screenshot attached in Discord appears to be a partial page/document preview with product-plan text, not a social/customer comment thread. If similar images were uploaded to SignalGen, the current prompt would treat that as non-customer-feedback UI/document text and return `{"comments":[]}` by design.

**UX issue:** Even if the model behavior is technically correct, the product currently gives the user no visibility into what Gemini saw, what text was extracted, or whether the image failed because it was not a comment screenshot versus because OCR/model extraction was too strict.

**Future fix milestone:** Add extraction diagnostics:

1. Store an `extraction` object on each run with per-file status, model response summary, and warnings.
2. Show a preview of extracted comments before/after run creation.
3. Allow a safe fallback path for demos, such as manually pasted comments or `Use sample feedback`, so the full workflow can be tested even when screenshot OCR fails.
4. Improve the Gemini prompt to handle app reviews, social comments, Discord/Slack snippets, support tickets, and plain text feedback screenshots.
5. Add tests with realistic screenshot-like fixtures and Gemini-response fixtures.

### Feedback item 3: User profiles/login and workflow ownership

**Question:** Should SignalGen add a full user profile/login feature? Without accounts, how are workflows and memories stored per user?

**Current storage state:**

- Runs are stored in MongoDB collection `runs` through `src/app/api/runs/route.ts`.
- `GET /api/runs` currently reads `db.collection("runs").find({}).sort({ createdAt: -1 }).limit(20)`.
- `POST /api/runs` inserts a run into the same shared collection.
- `SignalGenRun` currently has no `userId`, `workspaceId`, `organizationId`, or auth owner field.
- That means the current app behaves like a single shared demo workspace, not a multi-user SaaS product.

**Real product recommendation:** Do not frame this as a hackathon-only shortcut. For the actual product, SignalGen should be designed as a workspace-based SaaS from the start, where analysis/planning can launch before full implementation automation, but every run eventually belongs to a workspace and a connected product repository. The hosted-agent milestone still makes sense, but its first production-grade scope should be analysis/planning plus memory, not arbitrary code-writing.

**Current state:** SignalGen can process uploaded customer-feedback screenshots, extract comments, create/analyze a run, and store the run in MongoDB. It currently behaves like one shared workspace. It does not yet have login, user profiles, workspace ownership, a project/repository connection, selected GitHub repo permissions, a local checkout permission model, or a separate implementation-job system.

**Important implementation gap:** Today SignalGen does not truly know which product repository/codebase it should modify. A run contains extracted comments and an analysis/plan, but it is not linked to a workspace, GitHub installation, repository, default branch, local checkout, or write-permission grant. Therefore, autonomous implementation cannot be treated as production-ready until repo access is explicit and scoped.

**Option A: SaaS/GitHub mode — best long-term:** The durable product model is a hosted SaaS where users connect GitHub intentionally through a GitHub App or OAuth flow, select which repositories SignalGen can access, and approve implementation jobs before any branch/commit/PR is created. SignalGen should work from GitHub as the source of truth rather than assuming it can access a developer's laptop filesystem.

```txt
User signs in
→ creates/selects workspace
→ connects product/project
→ installs GitHub App or completes GitHub OAuth
→ selects allowed repo(s)
→ SignalGen stores repo metadata and permission status
→ SignalGen analyzes feedback and proposes implementation
→ user approves a specific implementation job
→ SignalGen creates branch, commits changes, pushes branch, opens PR
→ SignalGen stores PR URL, commit SHA, preview URL, logs, and rollback notes
```

**Why Option A is the best long-term default:**

- It matches how a real SaaS product can safely operate without accessing local laptops.
- GitHub permissions can be scoped to selected repositories.
- Every code-writing action is auditable through branches, commits, and PRs.
- The user's review process remains intact: generated changes are proposed through PRs, not silently applied to production.
- It works for teams, because repo permissions and PR review are already collaboration primitives.
- It gives SignalGen a clean implementation target: workspace → project → repo → branch → PR.

**Future fix milestone:** Add authentication, workspace-scoped memory, and repository/project connections:

1. Choose auth provider: Clerk, Auth.js/NextAuth, or Supabase Auth.
2. Add `users` and `workspaces` or equivalent collections.
3. Add `workspaceId` and `createdByUserId` to `runs`.
4. Scope all run reads/writes by workspace.
5. Add migration/backfill for existing demo runs into a `demo` workspace.
6. Add access-control tests so one user cannot read another user/workspace's runs.
7. Add a `project_repositories` or `integrations` collection that stores the linked GitHub owner/repo, default branch, allowed paths, and installation/account ID.
8. Add GitHub App/OAuth connection flow so the user grants repository access intentionally, ideally limited to selected repos.
9. Add a repo capability check before implementation: can read repo, create branch, commit changes, push branch, and open PR.
10. For local-codebase editing, add a separate local agent/runner consent model. A hosted service cannot safely write to a user's laptop filesystem unless the user runs a local connector that grants access to a specific directory.
11. Require founder approval before any branch creation, commit, push, PR, or local file write.
12. Store implementation jobs separately from analysis runs, with status, target repo, branch, commit SHA, PR URL, preview URL, logs, and rollback notes.

### Feedback item 4: Sentry/PostHog data from LetterGen as a second feedback source

**Idea:** Add Sentry and PostHog to LetterGen, then share product analytics/errors/session feedback with SignalGen. This becomes a second SignalGen ingestion path beyond uploaded screenshots.

**Recommendation:** This is a strong future direction and matches SignalGen's positioning as an event-driven/periodic product-iteration agent. Park it until after hosted agent deployment, because the hosted agent should become the stable ingestion/processing layer for all sources.

**Future ingestion sources:**

1. Screenshot uploads from dashboard.
2. Manual pasted feedback/comments for reliable demos.
3. Sentry issues from LetterGen: exceptions, affected routes, frequency, user impact.
4. PostHog analytics from LetterGen: funnels, drop-offs, rage clicks/session replay signals, feature usage.
5. Support/customer channels later: email, Intercom, Discord, Slack, app-store reviews, social comments.

**Future fix milestone:** Create `feedback_events` or `source_events` collection and normalize all inputs into one schema before agent analysis.

### Feedback item 5: Hosted engine deployment remains step 1

**Decision:** Hosted Google agent deployment remains an important architecture milestone, but from a real-product point of view it should be scoped as the hosted analysis/planning/memory layer first. The roadmap should not depend on demo-only assumptions such as a hardcoded LetterGen repo or a local checkout path. Product-grade implementation automation requires workspace ownership and GitHub/repository permissions first.

**Real-product roadmap assessment:** The roadmap still makes sense if we treat SignalGen as a staged SaaS product:

- First, prove the feedback → signal → plan loop works reliably.
- Second, move that loop into a hosted agent service so it can run consistently and periodically.
- Third, add workspace/repository context so every signal is tied to a real product.
- Fourth, add GitHub App/OAuth and explicit implementation-job approvals.
- Fifth, only then allow guarded branch/commit/push/PR automation.

The main change is that implementation automation should not be described as the immediate next capability after hosted deployment. It should be a later product layer after identity, workspace ownership, repository connection, and approval gates.

**Revised product-first priority order:**

```txt
1. Hosted Google ADK/Cloud Run agent service for analysis/planning
2. Dashboard-to-hosted-agent contract
3. Reliable processing and MongoDB memory chain
4. UX fixes for upload/extraction reliability
5. User/workspace ownership
6. GitHub/repository integration and scoped implementation permissions
7. Additional data sources from Sentry/PostHog and other channels
8. Guarded implementation/PR automation
```

## Detailed staged product roadmap

### Stage 1: Hosted agent service for analysis/planning

**Product goal:** Make SignalGen's core intelligence run as a real hosted backend service instead of logic coupled to the Vercel app runtime.

**User value:** A founder can upload feedback, have SignalGen process it reliably, and receive a structured product signal and suggested plan without depending on local/dev-only execution.

**Scope:**

- Deploy the ADK TypeScript agent as a hosted Google Cloud service, likely Cloud Run first.
- Keep the first hosted contract narrow: health check, process one run, return analysis status.
- Preserve the existing dashboard flow: dashboard creates a run, then calls the hosted agent to process it.
- Store analysis output back in MongoDB.
- Keep code-writing disabled unless the target repo and permissions are explicitly configured later.

**Primary implementation areas:**

- `agent/` standalone ADK TypeScript service.
- `src/app/api/agent/tick/route.ts` as the dashboard-to-agent boundary.
- `src/lib/agent-tick.ts` for shared orchestration logic.
- Google Cloud Run deployment config.
- Google Secret Manager for Gemini/Mongo/service secrets.

**Acceptance criteria:**

- Hosted service exposes a health endpoint.
- Hosted service can process one pending MongoDB run by `runId`.
- Dashboard can trigger the hosted service instead of only local/in-process logic.
- Failures are visible in logs and surfaced to the dashboard.
- No autonomous repo writes happen in this stage.

**Risk to watch:** The current `agent/` package imports app-side files from `src/lib`, so the standalone hosted package needs clearer boundaries before deployment is production-grade.

### Stage 2: Dashboard-to-hosted-agent contract

**Product goal:** Make the web app and hosted agent communicate through a stable API contract.

**User value:** The product feels like one coherent app even though the frontend/dashboard and agent runtime are separate services.

**Scope:**

- Define request/response schema for processing a run.
- Add authentication between Vercel dashboard and hosted agent using a worker/service secret.
- Add retry-safe behavior so clicking or scheduled jobs do not double-process the same run.
- Add clear statuses such as `uploaded`, `processing`, `signal_detected`, `needs_more_evidence`, `approved`, `implementation_pending`, `implemented`, and `failed`.
- Display processing errors in the dashboard instead of silently failing.

**Primary implementation areas:**

- `src/app/api/agent/tick/route.ts`
- `src/lib/types.ts`
- `src/lib/agent-tick.ts`
- `agent/src/agent.ts`
- `agent/src/tools/runs.ts`
- `agent/src/schemas.ts`

**Acceptance criteria:**

- API contract is documented and covered by tests.
- Dashboard can process a specific `runId` idempotently.
- Hosted agent rejects requests without the service secret.
- Run status transitions are deterministic and visible in MongoDB.

### Stage 3: Reliable processing and MongoDB memory chain

**Product goal:** Turn MongoDB from simple run storage into SignalGen's product-iteration memory layer.

**User value:** SignalGen remembers what feedback came in, what signal was detected, what decision was made, and what happened next.

**Scope:**

- Make run records durable and auditable.
- Store extracted comments, signal clusters, agent decisions, founder decisions, and implementation plans as linked records or structured fields.
- Add provenance: which screenshot/source produced which comment.
- Add enough history to explain why SignalGen recommended a change.
- Prepare schema for future sources like Sentry, PostHog, support channels, and social comments.

**Primary implementation areas:**

- `src/lib/types.ts`
- `src/app/api/runs/route.ts`
- `src/app/api/runs/[runId]/route.ts`
- `src/lib/gemini-extraction.ts`
- `src/lib/adk-agent-runtime.ts`
- MongoDB collections: `runs`, later `source_events`, `signal_clusters`, `agent_decisions`.

**Acceptance criteria:**

- Every run has a clear lifecycle and timestamps.
- Dashboard can show evidence behind a signal.
- Agent decisions can be traced back to specific comments/source events.
- Failed extraction or failed analysis leaves a useful debug trail.

### Stage 4: Upload and extraction reliability

**Product goal:** Make the first user input path trustworthy enough for real users, not just controlled demos.

**User value:** Users can reliably get feedback into SignalGen and understand what the agent extracted.

**Scope:**

- Fix drag-and-drop upload.
- Add extraction preview before final run creation.
- Show per-file extraction status and warnings.
- Add manual paste fallback for comments.
- Add `Use sample feedback` for onboarding/demo reliability.
- Improve the extraction prompt to support social comments, app reviews, support tickets, Discord/Slack snippets, and product feedback screenshots.

**Primary implementation areas:**

- `src/app/dashboard/page.tsx`
- `src/app/api/runs/route.ts`
- `src/lib/gemini-extraction.ts`
- `src/lib/types.ts`
- New tests for extraction parsing and dashboard upload behavior.

**Acceptance criteria:**

- Dragging a PNG/JPG/WebP onto the upload area selects the file.
- User can see extracted comments before creating/running analysis.
- If extraction returns zero comments, the UI explains why and offers manual paste/sample feedback fallback.
- Upload constraints are clear: PNG/JPG/WebP, max 5 screenshots, 4 MB each, 8 MB total.

### Stage 5: User/workspace ownership

**Product goal:** Move from a single shared prototype workspace to real SaaS identity and tenant-safe storage.

**User value:** Each founder or team sees only their own product feedback, history, decisions, and connected integrations.

**Scope:**

- Choose auth provider: Clerk, Auth.js/NextAuth, or Supabase Auth.
- Add `users` and `workspaces` collections or equivalent models.
- Add `workspaceId` and `createdByUserId` to all runs and future source events.
- Scope every read/write by workspace.
- Backfill existing prototype runs into a default/demo workspace.
- Add roles such as owner/admin/member/viewer/agent-service where needed.

**Primary implementation areas:**

- Auth provider setup.
- `src/lib/types.ts`
- `src/app/api/runs/route.ts`
- `src/app/api/runs/[runId]/route.ts`
- Dashboard routing/layout for selected workspace.
- MongoDB indexes for `workspaceId`, `createdAt`, and source/status fields.

**Acceptance criteria:**

- User must sign in to access workspace data.
- Runs are created with `workspaceId` and `createdByUserId`.
- API tests prove one workspace cannot read another workspace's runs.
- Dashboard history is workspace-scoped.

### Stage 6: GitHub/repository integration and scoped implementation permissions

**Product goal:** Give SignalGen an explicit, authorized codebase target for implementation work.

**User value:** Users can connect a product repo once, then SignalGen can safely propose PRs against the right codebase after approval.

**Scope:**

- Add GitHub App or OAuth connection.
- Let users select allowed repositories.
- Store repo metadata in `project_repositories` or `integrations`.
- Store default branch, allowed paths, installation/account ID, permission status, and connected workspace.
- Add repo capability checks: read repo, create branch, commit, push branch, open PR.
- Do not store raw tokens in application collections; use provider installation IDs/secrets and secure secret storage.

**Primary implementation areas:**

- New collection/model: `project_repositories` or `integrations`.
- New API routes for connect/callback/repo selection.
- GitHub App/OAuth config.
- `agent/src/tools/github.ts`
- Dashboard settings page for connected repositories.

**Acceptance criteria:**

- User can connect GitHub and select one repo.
- SignalGen stores repo metadata without exposing secrets.
- Capability check displays whether SignalGen can read/create branch/commit/push/open PR.
- Runs can be linked to a project repository.
- Implementation remains approval-gated.

### Stage 7: Additional data sources from Sentry/PostHog and other channels

**Product goal:** Expand SignalGen from screenshot-only input to an event-driven product signal system.

**User value:** SignalGen can detect product issues from real usage, errors, funnels, and customer channels without requiring manual screenshot uploads every time.

**Scope:**

- Add `source_events` collection.
- Add Sentry ingestion for issues, error frequency, affected routes, severity, and release context.
- Add PostHog ingestion for funnels, drop-offs, rage clicks/session signals, and feature usage trends.
- Later add support channels such as email, Intercom, Discord, Slack, app-store reviews, and social comments.
- Redact PII before storing or sending events to agent prompts.
- Deduplicate and cluster repeated signals across sources.

**Primary implementation areas:**

- `source_events` collection.
- New ingestion API routes or scheduled import jobs.
- Agent tools that read normalized source events.
- Dashboard filters by source, severity, status, and date.

**Acceptance criteria:**

- Sentry/PostHog events can be imported into normalized `source_events`.
- Agent can cluster telemetry with uploaded feedback.
- Dashboard can show source provenance for each signal.
- PII/redaction rules are applied before agent analysis.

### Stage 8: Guarded implementation/PR automation

**Product goal:** Let SignalGen move from recommendation to approved implementation while preserving founder control and engineering safety.

**User value:** A founder can approve a validated signal and receive a ready-to-review GitHub PR instead of manually translating feedback into code changes.

**Scope:**

- Create `implementation_jobs` separate from analysis `runs`.
- Require explicit user approval before each implementation job.
- Generate an implementation plan before code edits.
- Create branch, edit files, commit, push, and open PR through GitHub integration.
- Run tests/build/lint when possible.
- Capture PR URL, commit SHA, Vercel preview URL, logs, and rollback notes.
- Enforce guardrails for auth, billing, secrets, production DB changes, direct main-branch pushes, and destructive changes.

**Primary implementation areas:**

- `implementation_jobs` collection.
- `agent/src/tools/github.ts`
- Agent implementation planner/executor tools.
- Dashboard approval UI.
- GitHub PR creation and status tracking.
- Optional Vercel preview integration.

**Acceptance criteria:**

- SignalGen cannot write code without an approved implementation job.
- Every implementation job is tied to workspace, run, repo, branch, and approving user.
- PR is opened on a non-main branch.
- Dashboard shows job status, changed files, PR URL, preview URL, logs, and failures.
- Sensitive/destructive changes are blocked or require an extra approval step.

---

## Future feature backlog after hosted engine milestone

### Future Milestone F: Upload and extraction reliability

**Objective:** Make the first user interaction reliable enough for demos and early users.

**Features:**

- Real drag-and-drop upload support.
- Visual drag-over and validation states.
- Better upload errors for wrong file type, too-large files, and invalid image signatures.
- Extraction preview before committing a run.
- Per-screenshot extraction status and warnings.
- Manual pasted feedback fallback.
- `Use sample feedback` demo path.

**Primary files:**

- `src/app/dashboard/page.tsx`
- `src/app/api/runs/route.ts`
- `src/lib/gemini-extraction.ts`
- `src/lib/types.ts`
- `src/lib/gemini-extraction.test.ts`

### Future Milestone G: User login, workspace memory, and access control

**Objective:** Move from single shared demo workspace to user/workspace-scoped product memory.

**Features:**

- Login/signup.
- Workspace/team concept.
- Run ownership via `workspaceId` and `createdByUserId`.
- Workspace-scoped dashboard history.
- Safe migration/backfill for existing demo runs.
- Access-control tests for every run API route.

**Non-goal for now:** Do not implement this before hosted engine unless the product must be shared with real external users immediately.

### Future Milestone H: LetterGen telemetry ingestion via Sentry and PostHog

**Objective:** Let SignalGen ingest real product behavior from LetterGen, not only screenshots.

**Features:**

- Add Sentry to LetterGen for runtime errors and affected user paths.
- Add PostHog to LetterGen for product analytics, funnels, and feature usage.
- Build SignalGen ingestion endpoints/jobs for Sentry/PostHog exports or webhooks.
- Normalize telemetry into `source_events`.
- Cluster telemetry with uploaded comments so bugs, friction, and feature requests share one decision pipeline.

**Guardrail:** Treat telemetry as potentially sensitive. Do not expose raw user identifiers or session data in generated plans. Use redaction/summarization before agent decision-making.

### Future Milestone I: Multi-source product signal memory

**Objective:** Turn MongoDB into the memory layer for every product-iteration loop, not only upload runs.

**Possible collections:**

```txt
runs
source_events
signal_clusters
agent_decisions
implementation_jobs
workspaces
users
integrations
```

**Features:**

- Store source provenance for every signal.
- Link evidence back to uploaded screenshot names, Sentry issue IDs, PostHog event names, or support-channel message IDs.
- Deduplicate repeated feedback across sources.
- Track decisions over time: ignored, needs more evidence, planned, approved, implemented, shipped.
- Add dashboard filters by source, workspace, severity, status, and date.

### Future Milestone J: Guarded implementation automation

**Objective:** After hosted analysis is stable, let approved runs generate implementation plans and PRs safely.

**Features:**

- Approval-only implementation job creation.
- GitHub branch/PR creation.
- Vercel preview link capture.
- Build/test status shown in SignalGen dashboard.
- Strict guardrails around auth, billing, secrets, production DB changes, and direct main-branch pushes.

---

## Google Cloud setup checklist

Enable likely required services:

```bash
gcloud services enable run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  logging.googleapis.com \
  aiplatform.googleapis.com \
  generativelanguage.googleapis.com \
  --project signalgen-496700
```

Create secrets only after confirming values with the user:

```bash
gcloud secrets create signalgen-gemini-api-key --replication-policy=automatic

gcloud secrets create signalgen-mongodb-uri --replication-policy=automatic

gcloud secrets create signalgen-agent-worker-secret --replication-policy=automatic
```

Bind secrets to Cloud Run after deploy:

```bash
gcloud run services update signalgen-agent \
  --region us-central1 \
  --project signalgen-496700 \
  --set-secrets GEMINI_API_KEY=signalgen-gemini-api-key:latest,MONGODB_URI=signalgen-mongodb-uri:latest,AGENT_WORKER_SECRET=signalgen-agent-worker-secret:latest
```

Optional later GitHub secret:

```bash
gcloud run services update signalgen-agent \
  --region us-central1 \
  --project signalgen-496700 \
  --set-secrets GITHUB_TOKEN=signalgen-github-token:latest
```

---

## ADK Cloud Run deployment command shape

From the current ADK CLI, the practical deploy path is:

```bash
cd /Users/vivianli/projects/SignalGen/agent

npm run typecheck
npm test

npx adk deploy cloud_run . \
  --project signalgen-496700 \
  --region us-central1 \
  --service_name signalgen-agent \
  --compile true \
  --bundle true \
  --file_type esm
```

Do not run this deployment until the implementation is ready and the user approves deployment.

---

## Demo wording after Cloud Run milestone is complete

Use precise wording and avoid overclaiming direct Agent Engine if the hosted runtime is Cloud Run:

> SignalGen uses a code-first Google ADK TypeScript agent hosted on Google Cloud. The Vercel dashboard creates feedback runs and calls the hosted agent. The agent uses Gemini to classify and cluster feedback, proposes product changes only when evidence is strong, stores the full decision trail in MongoDB, and keeps GitHub actions behind founder approval.

If asked about Agent Engine specifically:

> The current hosted runtime is Cloud Run using the ADK TypeScript deployment path. The architecture is ready to move to Gemini Enterprise Agent Platform / Agent Engine as the direct hosted agent runtime once that path is stable for our setup.

---

## Overall success criteria

1. Agent package is deployable without fragile imports from the app source tree.
2. Hosted Cloud Run service exposes `/health` and `/process-run`.
3. Hosted agent loads secrets safely from Google Cloud configuration.
4. Hosted agent can process one MongoDB run and persist the result.
5. Vercel `/api/agent/tick` calls hosted agent when configured.
6. Local fallback still works when hosted environment variables are absent.
7. Cloud Scheduler can trigger periodic processing.
8. PR automation remains optional and approval-gated.
9. Public demo wording accurately describes current architecture.

---

## Open decisions before implementation

1. Should the hosted worker use ADK-generated API server endpoints directly, or a thin custom HTTP wrapper with `/health` and `/process-run`?
2. Should shared signal analysis move to a root shared package, or be duplicated inside `agent/src/core/` for deployment simplicity?
3. Should Cloud Scheduler call Vercel `/api/agent/tick` or Cloud Run `/process-run` directly?
4. When PR automation begins, should code editing happen in Cloud Run, Cloud Build, GitHub Actions, or remain local/demo-only first?
