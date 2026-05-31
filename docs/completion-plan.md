# SignalGen Completion Plan

> **For Hermes:** Follow `code-change-workflow` and TDD. Each step must start with feature description + success criteria, then tests, implementation, verification, summary, commit/deploy when appropriate.

**Goal:** Finish a hackathon-ready SignalGen demo: screenshot feedback becomes extracted comments, product signal, founder decision, guarded implementation action, and persistent MongoDB memory, with clear user testing documentation.

**Architecture:** Keep the dashboard as the founder control room. Keep MongoDB as the memory layer. Keep dangerous code-changing/PR behavior behind explicit approval and initially implement a guarded, auditable implementation-action record before any real repo mutation.

**Tech Stack:** Next.js App Router, MongoDB Node driver, Gemini REST API, Vitest, Vercel, GitHub/Vercel links as future automation targets.

---

## Current completed foundation

- Landing page and dashboard deployed on Vercel.
- MongoDB-backed run history.
- Real screenshot upload with Gemini multimodal extraction.
- Agent tick classifies/clusters evidence and marks strong signals `plan_ready`.
- Founder approval/rejection gate stores structured decisions.

## 2026-05-31 completion checkpoint

The hackathon/demo MVP loop is complete enough to call the main loop done:

```txt
screenshot feedback
→ extracted comments
→ multiple durable product signals
→ founder decision
→ guarded implementation job/action
→ persistent MongoDB memory
```

Production verification after merge confirmed:

- PR branch `feat/clickable-signal-detail` was merged into `main`.
- Vercel production deploy is ready on `https://signalgen-delta.vercel.app`.
- Production health endpoint returns OK.
- Signed-in OpenCLI Agent Chrome verification confirmed the repo-scoped dashboard for `viviannnl/ai-cover-letter` shows **18 signals** in **All signals**.
- The latest screenshot/run is no longer collapsed into one signal; the signed-in UI shows multiple signals such as Direct Resume Submission, Additional resume format options, UI visual polish concerns, dashboard hierarchy concern, and praise/value validation.
- Signal cards are clickable and open the signal detail drawer.
- Browser console showed no app errors during signed-in verification.

---

## Step 1: Implementation action record after founder approval

**Feature:** Add a guarded “Start implementation” action for approved runs. It records an implementation job in MongoDB but does not edit code or create a PR yet.

**Why:** This creates the next auditable state in the founder product loop while keeping risk low.

**Success criteria:**
1. Dashboard shows **Start guarded implementation** only for approved runs without an implementation job.
2. API accepts only approved runs.
3. API creates an `implementation` object with status `queued`, branch name, summary, guardrails, createdAt, and createdBy.
4. Non-approved runs return HTTP 409.
5. Re-running the action on the same run returns the existing implementation instead of duplicating it.
6. No code is edited and no GitHub PR is created in this step.
7. Unit tests cover allowed, blocked, and idempotent behavior.

## Step 2: Implementation job processor / PR preparation summary

**Feature:** Add an endpoint that turns a queued implementation job into a `ready_for_pr` plan: proposed branch, files to inspect, acceptance criteria, test commands, and PR title/body draft.

**Why:** This demonstrates multi-step agent planning after approval without risky repo edits.

**Success criteria:**
1. API processes only approved runs with queued implementation jobs.
2. Implementation status changes from `queued` to `ready_for_pr`.
3. Stores a PR draft with title, body, branch, checklist, and Vercel preview placeholder.
4. Dashboard displays the PR draft and next manual action.
5. Tests cover status transitions and invalid states.

## Step 3: Dashboard detail and full memory view

**Feature:** Improve the dashboard so a user can inspect extracted comments, clusters, founder decision, implementation status, and PR draft for each run.

**Why:** The demo needs to visibly prove the full memory loop.

**Success criteria:**
1. Latest run panel shows extracted comments.
2. Run history shows status, decision, and implementation state.
3. A run detail section or expanded cards show evidence, rationale, approval, and implementation info.
4. Browser console has no errors.

## Step 4: Documentation and user testing guide

**Feature:** Write a detailed Markdown guide describing the project, user flow, and how to test every feature.

**Why:** Hackathon reviewers and future Vivian need a single source of truth.

**Success criteria:**
1. Markdown file describes what SignalGen is, architecture, and feature list.
2. Includes step-by-step user testing for landing page, dashboard upload, Gemini extraction, agent tick, approval/rejection, implementation action, and PR draft.
3. Includes expected results and troubleshooting.
4. README links to the guide.

## Step 5: Production verification and final cleanup

**Feature:** Run full verification and production smoke tests.

**Success criteria:**
1. `npm test` passes.
2. Agent package typecheck/tests pass.
3. `npm run lint` passes.
4. `npm run build` passes.
5. Secret scan returns no findings.
6. Commit and push all intended files.
7. Vercel production deploy succeeds.
8. Production smoke test verifies health, upload/tick, approval, implementation action, and cleanup.

---

## Future steps after hackathon-ready completion

The main remaining features are now production SaaS hardening, not the hackathon/demo loop:

1. **Production Clerk auth/workspaces**
   - Finish production Clerk project/environment setup.
   - Replace demo/backward-compatible workspace behavior with real authenticated workspace/project membership.
   - Add access-boundary tests proving one user/workspace cannot read or mutate another workspace's runs, signals, plans, repo connections, or implementation jobs.

2. **Real PR automation behind hardened gates**
   - Keep real branch/commit/push/PR creation disabled until ownership, workspace membership, founder approval, capability flags, audit logs, retry/idempotency, kill switch, and sandbox smoke tests are production-grade.
   - Start with a controlled sandbox repo before enabling any real product repo writes.

3. **Event/source integrations and scheduled processing**
   - Move beyond manual screenshot/paste runs toward source/event ingestion from feedback channels and product analytics.
   - Add scheduled/background processing so SignalGen continuously maintains signal memory.
   - Add monitoring/failure visibility for ingestion and agent processing.

Later/deeper platform work:

- Connect Vercel preview URLs and deploy outcomes back into product memory.
- Move agent orchestration deeper into Google ADK / Gemini Enterprise Agent Platform runtime when the product loop needs it.
- Add MongoDB MCP or other scoring integrations only after the core production loop is stable.
