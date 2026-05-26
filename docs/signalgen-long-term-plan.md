# SignalGen Long-Term Product Plan

> **Canonical source of truth.** Use this document as the current long-term roadmap for SignalGen. Older dated plans in `docs/` are historical execution records; when product direction changes, update this file first.

**Last updated:** 2026-05-26

**Product thesis:** SignalGen is the memory layer of the founder's product iteration loop. It collects feedback/events, turns them into durable product signals, accumulates evidence, proposes plans only when evidence is strong enough, and eventually helps implement approved changes safely through audited PRs.

---

## 1. Current product checkpoint

SignalGen is currently a staged, workspace-shaped SaaS prototype with a hosted worker path, first-class signal memory, and repo-scoped dashboard/API workflows.

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
- M8 / repo-scoped implementation scaffold is complete and deployed on `main` in commit `6bb7e3e`:
  - connected repositories are visible in the dashboard repo picker,
  - the founder must select one explicit repo before creating runs, signals, decisions, implementation jobs, or PR work,
  - run/signal/decision/implementation/agent APIs fail closed without selected `repoConnectionId`,
  - DB mutations for active workflows include workspace/repo predicates,
  - implementation jobs can be queued/simulated,
  - real repo writes/PR creation remain guarded behind founder approval, repo capability flags, audit logs, and implementation gates.
- Real GitHub PR automation M1–M4 are complete on the `feat/real-github-pr-automation` branch:
  - security/product spec exists in `docs/github-pr-automation-spec.md`,
  - workspace-scoped repo connection, implementation job, and audit log types exist,
  - mocked repo connection API routes and tests exist,
  - production GitHub App install URL/callback routes are deployed behind signed state,
  - a GitHub App named `SignalGen Product Loop` is installed on Vivian's personal GitHub account with all-repositories access and code/issues/pull-request write permissions,
  - callback completion still leaves SignalGen repo-write capabilities disabled until repo selection, persistence, workspace/auth checks, and implementation executor gates are complete.
- Workspace scaffold exists:
  - workspace fields and demo/backward-compatible behavior exist,
  - repo-scoped reads/writes now use workspace/repo filters,
  - real production auth/workspace membership is not fully wired yet.

### Important current limitation

SignalGen now lets the demo workspace view all GitHub App-installed repositories and requires one selected repo before active work. The current live GitHub App installation still belongs to Vivian's personal GitHub account because Vivian completed GitHub's owner/sudo flow while signed in as `@viviannnl`; it is not a generic user login flow. The product can analyze, remember, plan, queue/simulate implementation intent, persist repo selection in the dashboard, and receive a GitHub App installation callback in production. Real branch/commit/push/PR automation remains gated until real auth, workspace ownership, founder approval, auditability, and a sandbox smoke test are production-grade.

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
3. GitHub App/OAuth installation or granting live repository permissions, except explicitly approved work. On 2026-05-25 Vivian approved generating GitHub App credentials, changing production env vars, deploying production install/callback routes, enabling repo write permissions, and selecting all repos for Vivian's installation. Real branch/commit/push/PR creation still requires the implementation gates below.
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

M8 and the repo-scoped GitHub App/dashboard path are complete on `main` in commit `6bb7e3e`. Installation/repo metadata persistence, repository selection/status APIs and UI, gated first-class implementation jobs, mocked executor gates, audit logs, retry/failure handling, capability-disable kill switch, and repo-scoped active workflows are implemented. Production verification confirmed the dashboard shows 21 connected repos, requires one selected repo, and fail-closes `/api/runs` and `/api/signals` without `repoConnectionId`. Real PR creation remains disabled unless all implementation gates pass.

Current behavior:

- Real GitHub PR creation remains disabled by default/gated by capability and approval checks.
- Implementation jobs are queued/simulated unless all executor gates pass.
- The dashboard shows connected repos and requires selecting one explicit repo before active work.
- Workspace-scoped repo connection domain helpers and Mongo-backed API routes exist.
- Production `/api/github/install` redirects to the `SignalGen Product Loop` GitHub App with signed state.
- Production `/api/github/install/callback` validates signed state and installation id, then returns installation metadata with all SignalGen repo-write capabilities disabled.
- The live installation currently belongs to Vivian's personal GitHub account (`@viviannnl`) and has all-repositories GitHub-side access. SignalGen can list these repos and persist the selected demo workspace repo in URL/localStorage and server-side `repo_connections`.
- A normal future user has not connected their own GitHub account yet; there is no production auth/session/workspace membership flow.
- Existing guardrails should prevent repo writing without explicit approval, workspace/repo connection, and repo capability.

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

#### A2. Add repo connection data model — complete locally

Implemented on `feat/real-github-pr-automation` in commit `783e802`:

- `repo_connections`, `implementation_jobs`, and `audit_logs` TypeScript domain shapes.
- Workspace-scoped repo connection helpers.
- Mocked repo connection API routes.
- Tests proving new connections default to disconnected and all write capabilities remain disabled.

Likely durable collections/models when moving from in-memory mocks to MongoDB:

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

#### A3. Add GitHub App connection flow — production callback and repo picker deployed

Completed on `feat/real-github-pr-automation`:

- Created/configured the `SignalGen Product Loop` GitHub App.
- Generated private key/client secret and configured production env without printing secret values.
- Deployed signed install redirect route: `/api/github/install`.
- Deployed installation callback route: `/api/github/install/callback`.
- Verified production callback accepts a valid signed state and installation id.
- Enabled GitHub-side repository permissions for Vivian's installation: all repositories plus code/issues/pull-request read/write.
- Kept SignalGen's internal `pr_creation`, `branch_push`, and `issue_creation` capabilities disabled after callback.

Important distinction:

- The current installation is **Vivian's GitHub installation**, because Vivian completed the GitHub App installation while signed in as `@viviannnl`.
- This does **not** mean arbitrary users have connected GitHub.
- A future user still needs an authenticated SignalGen session, workspace context, install callback persistence, and a repo picker before SignalGen can know their intended repo.

A3 follow-up status after commit `6bb7e3e`:

- GitHub installation metadata is persisted to workspace-scoped collections.
- Dashboard connection status and connected repo list are live.
- Repo selection UI is backed by GitHub installation repositories.
- Selected owner/repo/default branch/installation id are stored in `repo_connections`.
- Active workflows require one selected `repoConnectionId`.
- Write capabilities remain guarded until the selected repo is verified and an approved implementation job passes all gates.

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
- Repo-scoped active workflows now filter by workspace + selected repo.
- Real production auth provider is not fully wired.
- Some routes still intentionally depend on demo workspace behavior for local/hackathon usability.
- B1 auth provider decision record is created in `docs/2026-05-26-auth-workspaces-decision.md`: use Clerk first for authentication and organization/workspace identity, while keeping GitHub App installation as the repo-write permission model.

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

#### B1. Auth provider decision record — complete

Decision record: `docs/2026-05-26-auth-workspaces-decision.md`.

Decision: use Clerk first for production authentication and organization/workspace identity. Keep GitHub App installation as the repo-write permission model. SignalGen will map Clerk users/orgs into internal SignalGen users/workspaces/memberships so every product object remains workspace-scoped.

#### B2. Central session/workspace helper — started

Initial scaffold exists in `src/lib/auth.ts` with regression tests in `src/lib/auth.test.ts`. It defines:

- `AuthContext`,
- `AuthContextError`,
- `requireAuthContext(request, { allowDemo })`,
- explicit demo fallback gated by `SIGNALGEN_ALLOW_DEMO_AUTH`,
- trusted test headers for access-boundary tests outside production only.

Next B2 implementation step: install/configure Clerk and wire Clerk session/org data into `requireAuthContext()` while preserving fail-closed production behavior.

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
   - Provider chosen: Clerk (`docs/2026-05-26-auth-workspaces-decision.md`).
   - Implement session/workspace helper: scaffold started in `src/lib/auth.ts`; next wire Clerk session/org data.
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

Decision: use Clerk first. See `docs/2026-05-26-auth-workspaces-decision.md`.

Implementation still needs:

- Clerk project/app setup,
- env vars configured without exposing secret values,
- Clerk-backed `requireAuthContext()` helper (scaffold exists in `src/lib/auth.ts`),
- route-by-route migration from demo workspace fallback to authenticated workspace membership,
- access-boundary tests.

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

- `docs/2026-05-26-auth-workspaces-decision.md` — current Gap B provider decision record.
- `docs/2026-05-23-roadmap-execution-plan.md` — execution ledger for the M1-M8 Claude/Hermes loop.
- `docs/2026-05-23-hosted-google-agent-engine-deployment-plan.md` — detailed hosted-agent architecture notes.
- `docs/technical-design.md` — broader system design reference.
- `docs/stage1-cloud-run-deploy.md` — Cloud Run deployment/runbook reference.

When these disagree, update this file first and then reconcile older docs only if needed.
