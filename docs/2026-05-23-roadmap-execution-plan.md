# SignalGen Roadmap Execution Plan

> **For Hermes / Claude Code:** Use this as the resumable execution plan for completing the hosted-agent roadmap after Stage 1. Keep implementation milestone-sized, preserve current demo behavior, and keep production-risk actions gated behind Vivian approval.

**Goal:** Move SignalGen from the completed hosted-agent Stage 1 into a safer product-grade SaaS foundation: reliable agent processing, upload reliability, workspace ownership, source-event memory, repo integration scaffolding, and approval-gated implementation jobs.

**Architecture:** SignalGen remains a Next.js dashboard backed by MongoDB and a hosted Google/Cloud Run agent worker. The app should keep its current demo/default workspace behavior while adding provider-agnostic models and APIs for workspaces, source events, repositories, and implementation jobs. External integrations that require account permissions or secrets should be scaffolded and tested locally, not silently enabled in production.

**Tech Stack:** Next.js / React, TypeScript, MongoDB, Google Cloud Run worker, Gemini extraction/analysis paths, Vercel, local tests via Vitest/TypeScript builds, agent package tests/builds.

---

## Current Checkpoint

### Completed baseline

- Stage 1 hosted worker is complete and verified.
- Cloud Run worker: `signalgen-agent`, project `signalgen-496700`, region `us-central1`.
- Worker URL: `https://signalgen-agent-kcbkl7rb6q-uc.a.run.app`.
- Current repo branch: `main`.

### Completed during the Claude-Hermes loop before Claude hit its session limit

- `dd07637` — `feat: stage 2a — Gemini signal analysis, schema cleanup, MongoDB memory search`
- `5ba039e` — `fix: revert github.ts to safe placeholder, block PR automation until gates exist`
- `e3f6f2f` — `docs: worker API contract and server auth/error tests (M2)`

Claude stopped because of the Anthropic session limit:

```txt
You've hit your session limit · resets 9pm (America/Vancouver)
```

The last Claude session id was:

```txt
cab788b9-b5c6-4f89-958f-8472165861c1
```

Detailed run ledger also exists at:

```txt
/tmp/signalgen-full-roadmap-claude-loop/RUN_STATE.md
```

---

## Held / Gated Local Changes

These files are intentionally **not committed yet**:

| File | Status | Reason |
| --- | --- | --- |
| `src/app/api/cron/agent-tick/route.ts` | Protected with `CRON_SECRET`, but uncommitted | Scheduled/background processing is cost-generating and should only ship after explicit approval. |
| `vercel.json` | Uncommitted | Adds a Vercel cron schedule every 5 minutes. Requires Vivian approval before production deployment. |

Do not commit or deploy these until Vivian approves scheduled production cron behavior and any required secret/env setup.

---

## Global Safety Gates

Pause and ask Vivian before doing any of the following:

1. Production deployment or Vercel production environment changes.
2. Enabling or deploying scheduled cron/background processing.
3. Production database migrations or destructive database writes.
4. Auth-provider production setup or account-level permission changes.
5. Reading, printing, or pasting secret values.
6. GitHub App/OAuth installation or granting live repository permissions.
7. Real external-repo branch/commit/push/PR creation.
8. Live Sentry/PostHog credential setup or account connection.
9. Force push, hard reset, or destructive out-of-repo operations.

Routine local repo-scoped work, tests, docs, scaffolding, commits, and safe verification are allowed.

---

## Milestone Plan

### Task 1: Resume and verify Stage 2 checkpoint

**Objective:** Confirm the committed worker API contract and auth/error tests are clean before moving to Stage 3.

**Files:**
- Existing: `docs/api-contract-worker.md`
- Existing: `agent/tests/server.test.ts`

**Steps:**

1. Run app and agent verification:
   ```bash
   cd /Users/vivianli/projects/SignalGen
   npx tsc --noEmit
   npm test -- --run
   npm run build

   cd /Users/vivianli/projects/SignalGen/agent
   npm run typecheck
   npm test
   npm run build
   ```
2. Confirm Cloud Run safe smoke checks still pass:
   ```bash
   curl -sS https://signalgen-agent-kcbkl7rb6q-uc.a.run.app/health
   curl -sS -X POST https://signalgen-agent-kcbkl7rb6q-uc.a.run.app/process-run
   ```
3. Expected:
   - Health returns OK.
   - Unauthenticated `/process-run` returns 401.
   - Existing upload → extraction → agent-run behavior is not broken.

---

### Task 2: Stage 3 — MongoDB memory chain lifecycle and provenance

**Objective:** Make run state transitions and provenance durable enough to debug uploaded feedback, extraction, and agent analysis.

**Likely files:**
- Modify: `src/lib/types.ts`
- Modify: `src/app/api/runs/route.ts`
- Modify: `src/app/api/runs/[runId]/route.ts`
- Modify/add tests near existing run/agent tick tests

**Acceptance criteria:**

- Runs consistently track lifecycle fields such as `processedAt`, `processingError`, and extraction diagnostics.
- Source comments can be traced back to files or future source events.
- Failed extraction/analysis leaves a usable debug trail instead of silent failure.
- Existing MongoDB reads/writes remain backward-compatible with current demo data.
- Tests cover success and failure transitions.

---

### Task 3: Stage 4 — Upload and extraction reliability UX

**Objective:** Improve founder-facing upload reliability without requiring auth or extra setup.

**Likely files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/lib/gemini-extraction.ts`
- Modify: `src/app/api/runs/route.ts`
- Add/update tests for extraction parsing and fallback paths

**Acceptance criteria:**

- Dashboard supports drag-and-drop file selection.
- Upload constraints are visible: PNG/JPG/WebP, maximum files, and size limits.
- User can see extracted comments or extraction failures clearly.
- Manual paste fallback exists for feedback comments.
- “Use sample feedback” path exists for demo/hackathon flow.
- No-comment or extraction-failure cases are tested and user-readable.

---

### Task 4: Stage 5 — Workspace/user ownership scaffold

**Objective:** Add workspace boundaries while preserving current demo behavior and avoiding production auth setup.

**Likely files:**
- Modify: `src/lib/types.ts`
- Modify: `src/app/api/runs/route.ts`
- Create: `src/lib/workspace.ts`
- Add workspace-scoping tests

**Acceptance criteria:**

- `workspaceId` and `createdByUserId` exist where needed in the data model.
- Default/demo workspace keeps the product usable without login.
- API tests prove workspace-scoped reads/writes and prevent cross-workspace leakage.
- Production auth-provider setup remains documented and gated.

---

### Task 5: Stage 6 — GitHub/repository integration scaffold

**Objective:** Represent repository connection/capability state without enabling real write access.

**Likely files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/repo-integration.ts`
- Keep/verify: `agent/src/tools/github.ts`
- Add guardrail tests

**Acceptance criteria:**

- Repository metadata model exists for owner, repo, default branch, and capabilities.
- Capability checks are disabled/simulated unless explicitly enabled later.
- Real GitHub write actions remain impossible without workspace, repo connection, capability checks, and explicit approval.
- Tests prove unapproved runs cannot create PRs.

---

### Task 6: Stage 7 — Source events model for Sentry/PostHog-shaped input

**Objective:** Let the agent reason over normalized product events in addition to uploaded comments, without connecting live external accounts yet.

**Likely files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/source-events.ts`
- Create: `src/app/api/source-events/route.ts`
- Add normalization/redaction tests

**Acceptance criteria:**

- `source_events` model supports normalized Sentry/PostHog-shaped payloads.
- PII redaction/summarization happens before agent analysis or storage where applicable.
- Mock/local import API works without provider secrets.
- Tests prove events can be clustered with uploaded comments.

---

### Task 7: Stage 8 — Guarded implementation/PR automation scaffold

**Objective:** Add the data model and UI/API path for implementation jobs while keeping actual repo-writing blocked by default.

**Likely files:**
- Modify/create: `src/app/api/runs/[runId]/implement/route.ts`
- Modify: `src/lib/implementation-job.ts`
- Modify dashboard/run-detail UI for job status
- Keep real GitHub PR creation disabled unless gates are satisfied

**Acceptance criteria:**

- `implementation_jobs` model/status/logging exists and is tied to workspace, run, repo, branch, and approving user.
- Dashboard can show job status, changed files, plan/logs, and PR URL placeholder.
- Executor returns disabled/simulated unless all gates pass.
- Tests prove no code-writing/PR creation without explicit approval and repo capability.

---

## Verification Checklist Before Any Final Push/Deployment

Run:

```bash
cd /Users/vivianli/projects/SignalGen
npx tsc --noEmit
npm test -- --run
npm run build

cd /Users/vivianli/projects/SignalGen/agent
npm run typecheck
npm test
npm run build
```

Safe external checks:

```bash
curl -sS https://signalgen-agent-kcbkl7rb6q-uc.a.run.app/health
curl -sS -X POST https://signalgen-agent-kcbkl7rb6q-uc.a.run.app/process-run
```

Manual/browser QA if UI changed:

- Homepage loads.
- Dashboard loads.
- Upload area works.
- Drag/drop works.
- Manual paste works.
- Sample feedback works.
- Run history and run detail still work.
- Browser console has no obvious app errors.

Secret safety check before commit/push:

```bash
git diff --check
git diff --cached --check
```

Also review diffs manually for accidental secrets, tokens, connection strings, or raw provider payloads.

---

## Recommended Next Step

After Claude Code resets, resume from the latest checkpoint instead of starting over:

```bash
cd /Users/vivianli/projects/SignalGen
claude -p "Resume the SignalGen roadmap loop from docs/2026-05-23-roadmap-execution-plan.md and /tmp/signalgen-full-roadmap-claude-loop/RUN_STATE.md. First inspect git status and recent commits, then continue with Stage 3. Do not commit/deploy src/app/api/cron/agent-tick/route.ts or vercel.json unless Vivian explicitly approves scheduled production cron." --resume cab788b9-b5c6-4f89-958f-8472165861c1 --max-turns 120 --permission-mode bypassPermissions --output-format json
```

If resuming that session is too large, start a fresh Claude session with the same prompt and reference this file plus the run ledger.
