# SignalGen Long-Term Product Plan

> **Canonical source of truth.** Use this document as the current long-term roadmap for SignalGen. Older dated plans in `docs/` are historical execution records; when product direction changes, update this file first.

**Last updated:** 2026-05-24

**Product thesis:** SignalGen is the memory layer of the founder's product iteration loop. It collects feedback/events, turns them into durable product signals, accumulates evidence, proposes plans only when evidence is strong enough, and eventually helps implement approved changes safely through audited PRs.

---

## 1. Current product checkpoint

SignalGen is currently a staged, workspace-shaped SaaS prototype with a hosted worker path and first-class signal memory.

### Completed / mostly completed

- Hosted Cloud Run worker exists for Stage 1 analysis/planning.
- Dashboard can create feedback runs and trigger agent processing.
- MongoDB stores runs, signals, plans, and implementation-job scaffolding.
- First-class signal memory exists:
  - one run can create multiple signals,
  - one run can add evidence to existing signals,
  - weak signals can stay `accumulating`,
  - strong/actionable signals can become `plan_ready`,
  - first-class plans can be linked to signals.
- Dashboard has an **All signals** view backed by `/api/signals`, with legacy run fallback.
- M8 guarded implementation scaffold exists:
  - implementation jobs can be queued/simulated,
  - real repo writes/PR creation are not enabled by default.
- Workspace scaffold exists:
  - workspace fields and demo/backward-compatible behavior exist,
  - real production auth/workspace membership is not fully wired yet.

### Important current limitation

SignalGen is not yet allowed to modify a real code repository. The product can analyze, remember, plan, and queue/simulate implementation intent, but real branch/commit/push/PR automation remains gated until auth, workspace ownership, repository permissions, founder approval, and auditability are production-grade.

---

## 2. Product north star

```txt
Founder connects product feedback sources
→ SignalGen extracts comments/events
→ SignalGen clusters evidence into durable product signals
→ signals accumulate across time and sources
→ SignalGen proposes an action only when evidence is strong enough
→ founder approves or rejects the plan
→ SignalGen creates a guarded implementation job
→ approved job creates a branch/commit/PR in the connected repo
→ PR/review/deploy result becomes part of product memory
```

The product should stay event-driven/periodic, not prompt-driven. The founder should not need to ask the agent what to do; the system should continuously maintain signal memory and surface decisions when evidence warrants action.

---

## 3. Non-negotiable safety gates

Pause for explicit Vivian/founder approval before any of these actions:

1. Production deployment or production environment variable changes.
2. Auth-provider production setup or account-level permission changes.
3. GitHub App/OAuth installation or granting live repository permissions.
4. Real external-repo branch/commit/push/PR creation.
5. Production database migrations or destructive production database writes.
6. Reading, printing, or sharing secret values.
7. Billing/payment changes.
8. Force push, hard reset, or destructive out-of-repo operations.

Routine local repo-scoped planning, tests, scaffolding, and documentation are allowed.

---

## 4. Remaining high-risk gap A: GitHub App / real PR automation

### Goal

Let SignalGen safely create branches, commits, and pull requests in a user's connected product repository after explicit founder approval.

### Risk level

**High.** Repo write access is powerful and can damage source code, leak data, or surprise users if permissions and approvals are wrong.

### Current state

M8 created a guarded implementation/PR automation scaffold only.

Current behavior:

- Real GitHub PR creation is disabled.
- Implementation jobs are queued/simulated.
- The product has a placeholder path for implementation intent and job status.
- Existing guardrails should prevent repo writing without explicit approval and repo capability.

### Required before enabling real PR automation

1. **GitHub App or OAuth setup**
   - Prefer GitHub App for production because installation permissions can be scoped to selected repositories.
   - OAuth can be considered for account identity, but repo write automation should use least-privilege installation access where possible.

2. **Repo connection UI**
   - Founder selects workspace/project.
   - Founder connects GitHub.
   - Founder chooses allowed repositories.
   - UI clearly shows connected owner/repo/default branch/permission status.

3. **Per-workspace permissions**
   - Repository connection belongs to a workspace, not globally to the app.
   - Every implementation job must include `workspaceId`, `repoConnectionId`, target repo, target branch, approving user, and plan/signal references.
   - A user in workspace A must not be able to trigger writes in workspace B.

4. **Approval gate in dashboard**
   - No branch creation, commit, push, or PR is allowed from analysis alone.
   - Founder must approve a specific plan/job.
   - Approval screen should show: signal, evidence, recommended change, files/areas likely to change, repo target, expected branch name, and risk warning.

5. **Job tracking, retry, and failure states**
   - Track states such as `queued`, `blocked`, `running`, `failed`, `succeeded`, `cancelled`, and `requires_attention`.
   - Store logs, error class, retry count, started/completed timestamps, created branch, commit SHA, PR URL, and rollback notes.
   - Retries must be idempotent and must not create duplicate branches/PRs.

6. **Strong audit trail**
   - Store who approved, when, from which workspace, for which signal/plan, and exactly what repo permissions were used.
   - Store generated diff summary, files changed, commit SHA, PR URL, and final result.
   - Keep the original evidence and founder decision linked to the job.

7. **Tests proving it cannot write without founder approval**
   - Unit tests for permission checks.
   - API tests for unauthorized users/workspaces.
   - Integration tests with mocked GitHub client proving no write method is called unless all gates pass.
   - Regression tests for approval revocation, missing repo connection, wrong workspace, missing installation token, and duplicate retry.

### Suggested implementation phases

#### A1. Lock down the existing scaffold

- Review `src/lib/implementation-job.ts`, implementation API routes, and `agent/src/tools/github.ts`.
- Add/strengthen tests that prove real writes are impossible while capability is disabled.
- Define the exact job state machine.

#### A2. Add repo connection data model

Likely collections/models:

- `repo_connections`
- `implementation_jobs`
- optional `github_installations`

Required fields:

- `workspaceId`
- `provider: "github"`
- `owner`
- `repo`
- `defaultBranch`
- `installationId` or OAuth account reference
- `permissions`
- `status`
- `createdByUserId`
- `createdAt` / `updatedAt`

#### A3. Add GitHub App connection flow

- Create GitHub App manually first.
- Add app installation callback route.
- Store installation metadata without storing raw secret values in logs or docs.
- Add dashboard connection status.

#### A4. Add approved implementation executor

- Create branch from default branch.
- Apply bounded changes.
- Commit with traceable message.
- Push branch.
- Open draft PR.
- Store PR URL and commit SHA.

#### A5. Add production hardening

- Audit logs.
- Rate limits.
- Retry/idempotency protections.
- Monitoring.
- Manual kill switch.
- End-to-end tests with mocked GitHub plus a controlled sandbox repo before production enablement.

### Acceptance criteria for enabling real PR automation

Real PR automation can be enabled only when all are true:

- A workspace has a valid GitHub installation/repo connection.
- The user approving the job belongs to that workspace.
- The job references a `plan_ready`/approved plan and linked signal evidence.
- The dashboard approval explicitly authorizes implementation for that repo.
- Tests prove unapproved/wrong-workspace/missing-repo cases cannot call GitHub write APIs.
- Audit records are written for approval, attempted execution, and final result.
- A sandbox repo smoke test succeeds before any real product repo is connected.

---

## 5. Remaining high-risk gap B: Real auth/workspaces

### Goal

Make SignalGen production-grade for multiple users and workspaces, with reliable data boundaries and ownership.

### Risk level

**High.** Auth and workspace boundaries protect customer data. Mistakes can leak one user's product feedback, signals, repo metadata, or implementation jobs to another workspace.

### Current state

- Workspace scaffold exists.
- Demo/backward-compatible workspace behavior exists.
- Real production auth provider is not fully wired.
- Some routes may still depend on demo workspace behavior for local/hackathon usability.

### Required before production multi-user launch

1. **Choose/auth provider setup**
   - Candidate providers: Clerk, Auth.js/NextAuth, Supabase Auth, or another production-ready provider.
   - Decision should consider Next.js support, workspace/org support, GitHub OAuth compatibility, pricing, and local development experience.

2. **Login/session model**
   - Define user identity type.
   - Add session helper used consistently by API routes.
   - Decide how anonymous/demo mode behaves locally vs production.
   - Production should fail closed when a route requires identity.

3. **Workspace membership**
   - Model users, workspaces, memberships, and roles.
   - Roles should likely start simple: `owner`, `admin`, `member`.
   - Workspace selection should be explicit in dashboard.

4. **Data isolation rules**
   - Every product object must be workspace-scoped:
     - runs,
     - evidence items,
     - signals,
     - plans,
     - source events,
     - repo connections,
     - implementation jobs,
     - audit logs.
   - API reads and writes must always filter by authorized `workspaceId`.
   - Background workers must also process only authorized/scoped records.

5. **Production tests for access boundaries**
   - Tests prove user A cannot read/write workspace B records.
   - Tests prove missing session fails closed in production routes.
   - Tests prove demo fallback cannot accidentally expose production data.
   - Tests cover worker routes, dashboard APIs, signal APIs, plan/decision APIs, repo connection APIs, and implementation-job APIs.

### Suggested implementation phases

#### B1. Auth provider decision record

Create a short decision doc comparing providers and choose one. Include:

- setup complexity,
- workspace/org support,
- GitHub OAuth/GitHub App compatibility,
- local dev story,
- cost,
- production security posture.

#### B2. Central session/workspace helper

Create one canonical helper, for example:

- `src/lib/auth.ts`
- `src/lib/workspace.ts`

It should return:

- current user,
- selected workspace,
- role/membership,
- demo-mode fallback only when explicitly allowed.

#### B3. Route-by-route workspace enforcement

Update all APIs to use the central helper:

- `/api/runs`
- `/api/runs/[runId]`
- `/api/runs/[runId]/decision`
- `/api/runs/[runId]/implement`
- `/api/signals`
- `/api/source-events`
- `/api/agent/tick`
- cron/worker routes where applicable

#### B4. Data model hardening

Ensure every relevant collection has `workspaceId` and, where needed, `createdByUserId` / `updatedByUserId`.

Recommended indexes:

- `runs: { workspaceId, createdAt }`
- `signals: { workspaceId, signalKey }`
- `plans: { workspaceId, signalId, status }`
- `implementation_jobs: { workspaceId, status, createdAt }`
- `repo_connections: { workspaceId, provider, owner, repo }`
- `audit_logs: { workspaceId, createdAt }`

#### B5. Access-boundary test suite

Build a dedicated test suite with fixture users/workspaces:

- Alice in workspace A.
- Bob in workspace B.
- Optional admin/member role split.

Required tests:

- Alice cannot list Bob's runs/signals/plans.
- Alice cannot approve Bob's plan.
- Alice cannot trigger Bob's implementation job.
- Worker cannot process records outside the intended workspace.
- Missing auth fails closed in production mode.
- Demo fallback is available only when explicitly enabled for local/demo mode.

#### B6. Dashboard workspace UX

Add dashboard UI for:

- login/logout,
- current workspace switcher,
- workspace settings,
- members/roles,
- repo connection status once GitHub App work starts.

### Acceptance criteria for production auth/workspaces

Real auth/workspaces are production-ready when:

- All user-visible data belongs to a workspace.
- Every protected API route verifies session + workspace membership.
- Demo fallback cannot expose production data.
- Access-boundary tests cover core collections and routes.
- Background processing respects workspace boundaries.
- Audit logs can answer: who did what, in which workspace, to which signal/plan/job, and when.

---

## 6. Recommended order of remaining work

The safest order is:

1. **Finish and commit small local signal/dashboard bug fixes**
   - Keep current signal UI consistent while planning larger work.

2. **Real auth/workspaces foundation**
   - Choose provider.
   - Implement session/workspace helper.
   - Enforce workspace filtering route-by-route.
   - Add access-boundary tests.

3. **Repository connection model and GitHub App setup**
   - Add repo connection data model and dashboard UI.
   - Add GitHub App installation flow.
   - Keep write capability disabled until tests and approvals pass.

4. **Implementation job hardening**
   - Finalize job state machine, idempotency, retries, logs, audit trail.
   - Add approval UX and safety copy.

5. **Real PR automation in sandbox only**
   - Create branches/PRs against a controlled sandbox repo first.
   - Verify audit trail, failure handling, retries, and no-write-without-approval tests.

6. **Controlled production enablement**
   - Enable per workspace/repo.
   - Keep a kill switch.
   - Monitor logs and job outcomes.

---

## 7. Open decisions

### Auth provider

Options to evaluate:

- Clerk
- Auth.js/NextAuth
- Supabase Auth

Decision criteria:

- easiest Next.js integration,
- workspace/org support,
- secure session handling,
- GitHub identity compatibility,
- cost,
- local development flow,
- export/lock-in risk.

### GitHub integration model

Preferred default: GitHub App installation for repo write access.

Open question: whether OAuth should be used only for identity/account linking, with GitHub App installation used for repository writes.

### Local connector vs hosted GitHub-only writes

Preferred default: hosted SaaS writes through GitHub PRs only.

Local connector can be considered later for users who want SignalGen to modify a local checkout, but that is a separate consent and security model.

---

## 8. Verification checklist for future implementation work

Before committing any high-risk auth/GitHub work:

```bash
cd /Users/vivianli/projects/SignalGen
npm test
npm run lint
npm run build

cd /Users/vivianli/projects/SignalGen/agent
npm test
npm run build
```

Security checks:

- `git diff --check`
- staged diff review for secrets, tokens, bearer headers, connection strings, and private env values
- tests proving fail-closed behavior for missing approval/auth/workspace membership
- independent code review before enabling any production write capability

Manual checks when UI changes:

- dashboard loads,
- All signals view loads,
- approval/decision UI is clear,
- workspace context is visible,
- GitHub/repo connection state is explicit,
- browser console has no app errors.

---

## 9. Relationship to historical docs

Historical docs remain useful, but this file is the current roadmap source of truth.

- `docs/2026-05-23-roadmap-execution-plan.md` — execution ledger for the M1-M8 Claude/Hermes loop.
- `docs/2026-05-23-hosted-google-agent-engine-deployment-plan.md` — detailed hosted-agent architecture notes.
- `docs/technical-design.md` — broader system design reference.
- `docs/stage1-cloud-run-deploy.md` — Cloud Run deployment/runbook reference.

When these disagree, update this file first and then reconcile older docs only if needed.
