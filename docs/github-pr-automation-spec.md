# GitHub PR Automation Developer Spec

This document is the developer-facing contract for implementing real GitHub PR automation in SignalGen. It formalizes the state machine, security gates, MongoDB document shapes, failure taxonomy, and enablement checklist required before any workspace can create branches, commits, or pull requests in a real repository.

Real repo writes remain disabled until every gate and acceptance criterion below is implemented, tested, audited, and explicitly enabled for a workspace/repo.

---

## 1. Job state machine

### State transition diagram

```txt
queued
  -> blocked
  -> running
  -> cancelled

blocked
  -> queued
  -> cancelled
  -> requires_attention

running
  -> succeeded
  -> failed
  -> requires_attention
  -> cancelled

failed
  -> queued
  -> requires_attention
  -> cancelled

requires_attention
  -> queued
  -> cancelled

succeeded  [terminal]
cancelled  [terminal]
```

`ready_for_pr` exists only as a backward-compatible legacy status on the embedded run implementation scaffold. New implementation jobs must use the state machine above.

### State definitions and transitions

| State | Meaning | Trigger | Guard conditions to enter | Valid next states |
| --- | --- | --- | --- | --- |
| `queued` | A guarded implementation job exists and is waiting for execution or retry. No GitHub write has started for the current attempt. | User-approved implementation request passes all hard gates, or a retryable failure is scheduled for another attempt. | Workspace membership, repo connection, capability, approval, approver/session, idempotency, and resolvable target branch metadata all pass. For retries, `attempts` remains under the retry limit and the previous failure class is retry-eligible or idempotent. | `running`, `blocked`, `cancelled` |
| `blocked` | The job cannot run because a required pre-write gate or dependency is missing, but the condition may be fixed without recreating the plan. No GitHub write is allowed while blocked. | Gate evaluation finds a missing/inactive repo connection, disabled capability, missing installation token, or other pre-write dependency. | The job references a valid workspace/run/plan, but at least one required gate fails before writes begin. `errorClass` and `logs` must explain the blocking gate. | `queued`, `cancelled`, `requires_attention` |
| `running` | The executor has claimed the job and may perform GitHub read/write calls for the current attempt. | Worker atomically claims a queued job. | All hard gates are rechecked immediately before write, rate limit headroom is acceptable, an installation token is available, and no other active job has the same `idempotencyKey`. | `succeeded`, `failed`, `requires_attention`, `cancelled` |
| `failed` | The latest attempt failed. Retry may be possible only for retry-eligible failure classes and while under retry limits. | GitHub API error, transient infrastructure error, rate limit, or executor failure during an attempt. | Job was `running`; failure has a typed `errorClass`, safe `errorMessage`, incremented `attempts`, and log entry. No secrets may be stored in logs. | `queued`, `requires_attention`, `cancelled` |
| `succeeded` | Branch/commit/PR automation completed and durable result fields were stored. | Executor created or resolved the intended PR and persisted `commitSha`, `prUrl`, and `prNumber` where available. | Job was `running`; resulting PR belongs to the authorized repo connection and idempotency checks confirm it corresponds to this job. | Terminal unless an admin performs an explicit reset in a future maintenance workflow. |
| `cancelled` | The job was intentionally stopped before completion. It must not be retried automatically. | User/admin cancellation, kill switch, or manual safety intervention. | Actor has authority to cancel in the workspace; cancellation audit log is written. If cancellation happens while `running`, the executor must stop before additional writes where possible and record what already happened. | Terminal unless an admin performs an explicit reset in a future maintenance workflow. |
| `requires_attention` | Automation cannot safely continue without human review. This is for ambiguous or partially successful states. | Exhausted retries, unexpected branch/PR state, unclear GitHub response, conflict that cannot be resolved automatically, or possible partial write. | The job has enough logs and result metadata for a human to understand the state. Automatic retry is disabled until a human resolves it. | `queued`, `cancelled` |

### Terminal states

The default terminal states are:

- `succeeded`
- `cancelled`

`failed` and `requires_attention` are not terminal because a future operator action may retry or cancel them, but the system must not auto-retry them unless the failure class and retry policy allow it. Any transition out of `succeeded` or `cancelled` requires a future admin reset workflow and must write an audit log.

---

## 2. Security gates — all must pass before any write

Before any branch creation, file write, commit, push, or PR creation call, the API and executor must verify every gate below as a testable assertion. If any hard gate fails, no GitHub write method may be called.

1. Workspace membership
   - Assertion: the authenticated request user belongs to the target `workspaceId` and has a role allowed to approve/trigger implementation.
   - Failure class: `MissingWorkspaceMembership`.

2. Repo connection
   - Assertion: the workspace has a valid, active `repo_connection` document for the intended target repo.
   - Required document properties: `workspaceId` matches the job, `provider === "github"`, `status === "connected"`, and the owner/repo/default branch are present.
   - Failure class: `MissingRepoConnection`.

3. Capability enabled
   - Assertion: `repo_connection.capabilities.pr_creation === true`.
   - Current product state: this is always false, so real PR creation must remain disabled.
   - Failure class: `CapabilityDisabled`.

4. Explicit approval
   - Assertion: the run/plan has `status === "approved"` and `founderDecision.action === "approve"`.
   - The approved record must identify the exact signal/plan/run to implement.
   - Failure class: `MissingApproval`.

5. Approving user matches session
   - Assertion: the user recorded as approving the implementation is the authenticated session user making the request, or a future audited delegated approval flow explicitly says otherwise.
   - Failure class: `MissingApproval` or a more specific future `ApproverMismatch` class.

6. Idempotency
   - Assertion: no existing non-cancelled implementation job for the same workspace/run/plan idempotency key would create a duplicate PR.
   - Required key: deterministic hash of `workspaceId + runId` initially; include `planId` if multiple plans per run become executable.
   - Failure class: `DuplicateJob`, unless an existing job/PR can be returned as the idempotent result.

7. Installation token available
   - Assertion: when real writes are enabled, a GitHub App installation token can be resolved from `repo_connection.installationId` and server-side environment/configuration.
   - No raw token may be logged, stored in job logs, exposed in API responses, or committed to code.
   - Failure class: `MissingInstallationToken`.

8. Rate limit headroom
   - Assertion: GitHub rate limit information indicates enough remaining headroom for the planned operation, or the executor can safely defer until reset.
   - This is a soft gate: failure blocks the current attempt and schedules retry/backoff rather than permanently rejecting the job.
   - Failure class: `GitHubRateLimited`.

---

## 3. MongoDB document schemas

These are TypeScript-style interfaces for the durable MongoDB collections needed for real PR automation. `ObjectId` refers to MongoDB object identifiers serialized by the API as strings when returned to clients.

```typescript
type ObjectId = import("mongodb").ObjectId;

type RepoConnectionCapability = "pr_creation" | "branch_push" | "issue_creation";

type RepoConnectionStatus = "connected" | "disconnected" | "pending" | "error";

interface RepoConnection {
  _id: ObjectId;
  workspaceId: string;
  provider: "github";
  owner: string;
  repo: string;
  defaultBranch: string;
  installationId: string | null; // GitHub App installation ID
  capabilities: { pr_creation: boolean; branch_push: boolean; issue_creation: boolean };
  status: RepoConnectionStatus;
  disabledReason?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}
```

```typescript
type ImplementationJobStatus =
  | "queued"
  | "blocked"
  | "running"
  | "failed"
  | "succeeded"
  | "cancelled"
  | "requires_attention";

interface ImplementationJob {
  _id: ObjectId;
  workspaceId: string;
  runId: string; // reference to runs._id
  signalId?: string;
  planId?: string;
  repoConnectionId: string;
  status: ImplementationJobStatus; // expanded enum
  branchName: string;
  commitSha?: string;
  prUrl?: string;
  prNumber?: number;
  idempotencyKey: string; // hash of workspaceId+runId, prevents duplicates
  approvedByUserId: string;
  approvedAt: string;
  attempts: number;
  lastAttemptAt?: string;
  errorClass?: string;
  errorMessage?: string;
  logs: string[];
  createdAt: string;
  updatedAt: string;
}
```

```typescript
type AuditAction =
  | "repo_connection.created"
  | "repo_connection.updated"
  | "repo_connection.disabled"
  | "run.approved"
  | "run.rejected"
  | "implementation_job.created"
  | "implementation_job.gate_failed"
  | "implementation_job.started"
  | "implementation_job.retry_scheduled"
  | "implementation_job.succeeded"
  | "implementation_job.failed"
  | "implementation_job.requires_attention"
  | "implementation_job.cancelled";

interface AuditLog {
  _id: ObjectId;
  workspaceId: string;
  actorUserId: string;
  action: AuditAction; // enum of all auditable actions
  resourceType: "run" | "signal" | "plan" | "repo_connection" | "implementation_job";
  resourceId: string;
  detail: Record<string, unknown>;
  createdAt: string;
}
```

Required indexes before enablement:

- `repo_connections`: `{ workspaceId: 1, provider: 1, owner: 1, repo: 1 }`, unique for active connections if possible.
- `implementation_jobs`: `{ idempotencyKey: 1 }`, unique.
- `implementation_jobs`: `{ workspaceId: 1, status: 1, createdAt: 1 }` for worker polling.
- `audit_logs`: `{ workspaceId: 1, createdAt: -1 }`.

---

## 4. Failure taxonomy

Every failure must have a typed class, safe user-facing message, safe internal log message, and retry policy. Logs must never include access tokens, secret environment values, private keys, or raw authorization headers.

| Error class | Trigger | HTTP status code | Retry-eligible? | Job log appearance |
| --- | --- | ---: | --- | --- |
| `MissingWorkspaceMembership` | Authenticated user is absent from the target workspace or lacks an implementation approval role. | 403 | No | `Gate failed: MissingWorkspaceMembership for workspace <workspaceId>; no GitHub write attempted.` |
| `MissingRepoConnection` | No connected GitHub repo connection exists for the workspace/target repo. | 409 | No | `Gate failed: MissingRepoConnection; connect a GitHub repo before implementation.` |
| `CapabilityDisabled` | `repo_connection.capabilities.pr_creation !== true`; current default for all repos. | 409 | No | `Gate failed: CapabilityDisabled; PR creation capability is disabled for repo <owner>/<repo>.` |
| `MissingApproval` | Run/plan is not approved, `founderDecision.action !== "approve"`, approval is missing, or approving user/session do not match. | 409 | No | `Gate failed: MissingApproval; approved run/plan and matching approver are required.` |
| `DuplicateJob` | A non-cancelled implementation job already exists for the idempotency key and cannot be treated as the same request result. | 409 | No | `Gate failed: DuplicateJob; existing job <jobId> owns idempotency key <hash>.` |
| `MissingInstallationToken` | Real writes are enabled but no GitHub App installation token can be resolved from `installationId` and server config. | 503 | Yes, after re-install/reconfiguration | `Blocked: MissingInstallationToken for repo connection <repoConnectionId>; no token value logged.` |
| `GitHubRateLimited` | GitHub API rate limit or secondary abuse limit leaves insufficient headroom. | 429 | Yes, with backoff | `Retry scheduled: GitHubRateLimited until <resetAt>; attempt <attempts>.` |
| `GitHubAPIError` | GitHub returns an unexpected 5xx, network error, or retryable API failure during branch/commit/PR operations. | 502 | Yes, up to 3 times | `Attempt failed: GitHubAPIError during <operation>; status <status>; retry <nextRetryAt>.` |
| `BranchAlreadyExists` | Target branch already exists for this job or a prior idempotent attempt. | 409 | Idempotent: look up existing branch | `Idempotency check: BranchAlreadyExists for <branchName>; resolving branch before continuing.` |
| `PRAlreadyExists` | A PR already exists for the branch/job. | 409 | Idempotent: return existing PR URL | `Idempotency check: PRAlreadyExists for <branchName>; using existing PR <prUrl>.` |

API routes should map these classes to the listed HTTP status code. Worker-only failures should persist the same class on `ImplementationJob.errorClass` and transition according to the state machine.

---

## 5. Acceptance criteria checklist

Real PR automation can be enabled in any workspace only when all of the following are true:

- [ ] A workspace has a valid GitHub App installation or equivalent least-privilege repo connection.
- [ ] The repository connection is workspace-scoped and records owner, repo, default branch, installation ID, status, and capabilities.
- [ ] The user approving the job belongs to that workspace and has an allowed approval role.
- [ ] The job references a `plan_ready` or approved plan and linked signal evidence.
- [ ] The dashboard approval explicitly authorizes implementation for that exact repo.
- [ ] The approval screen shows the signal, evidence, recommended change, likely files/areas, repo target, expected branch name, and risk warning.
- [ ] `repo_connection.capabilities.pr_creation === true` is enabled only after explicit workspace/repo approval.
- [ ] Tests prove unapproved, wrong-workspace, missing-repo, disabled-capability, missing-token, and duplicate-job cases cannot call GitHub write APIs.
- [ ] Integration tests use a mocked GitHub client and assert no write method is called until all security gates pass.
- [ ] Implementation jobs persist workspace ID, repo connection ID, run/plan/signal references, approving user, branch, commit SHA, PR URL/number, attempts, errors, and logs.
- [ ] Retries are idempotent and cannot create duplicate branches or PRs.
- [ ] Audit records are written for approval, gate failures, attempted execution, retries, cancellation, and final result.
- [ ] A sandbox repo smoke test succeeds before any real product repo is connected.
- [ ] A manual kill switch or capability disable path can stop future writes for a workspace/repo.
- [ ] Logs and API responses have been reviewed to ensure they do not expose secrets, tokens, private keys, or raw authorization headers.

---

## 6. Non-goals for this milestone

This milestone does not include:

- Live GitHub App registration/installation.
- Production repo write capability.
- Real OAuth or user login.
- Auth provider integration.
- Any real branch creation, commit, push, PR creation, deployment, or production environment change.
- Any secret, token, private key, webhook secret, or credential value committed to the repository.
