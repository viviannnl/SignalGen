# SignalGen Technical Design

**Goal:** Define how SignalGen will be built from the current MongoDB-backed dashboard into a full AI product-iteration agent.

**Audience:** Developers, hackathon reviewers, and future AI coding agents implementing the next milestones.

**Product summary:** SignalGen is a code-first Google ADK TypeScript / Gemini Enterprise Agent Platform product-iteration agent that watches feedback from your social media and customer channels, decides when repeated bugs or feature requests have enough evidence to act, proposes safe product improvements, and stores the full loop in MongoDB as the memory layer of the founder's product iteration loop.

---

## 1. Current architecture

The current app is a Next.js application deployed on Vercel.

```text
Browser dashboard
  ↓
Next.js App Router pages and API routes
  ↓
MongoDB Atlas
```

Current deployed flow:

```text
/dashboard → /api/runs → MongoDB runs collection
/api/health → MongoDB ping
```

Current core files:

| File | Purpose |
| --- | --- |
| `src/app/page.tsx` | Landing page |
| `src/app/dashboard/page.tsx` | Founder dashboard UI |
| `src/app/api/health/route.ts` | Production health check and MongoDB ping |
| `src/app/api/runs/route.ts` | Create/list SignalGen runs |
| `src/lib/mongodb.ts` | MongoDB client helper |
| `src/lib/types.ts` | Shared TypeScript run types |
| `src/lib/demo-run.ts` | Temporary demo run generator |

---

## 2. Target architecture

Full intended architecture:

```text
Founder
  ↓
SignalGen dashboard on Vercel
  ↓
Next.js API routes / server actions
  ↓
Agent trigger layer
  ├─ upload-triggered: process a run immediately after screenshots arrive
  └─ periodic: Cloud Scheduler calls /api/agent/tick to process pending feedback
  ↓
Code-first Google ADK TypeScript agent deployed on Gemini Enterprise Agent Platform / Agent Engine
  ↓
Agent tools
  ├─ screenshot/comment extraction tool
  ├─ feedback classification + clustering tool
  ├─ evidence threshold decision tool
  ├─ MongoDB MCP memory tool
  ├─ approval-state tool
  ├─ GitHub PR tool
  └─ Vercel preview lookup tool
  ↓
MongoDB Atlas memory layer + product repo PR + Vercel preview
  ↓
SignalGen dashboard status updates
```

SignalGen should treat the dashboard as the control plane and MongoDB as the source of truth for each product iteration run. The dashboard is **not** the agent. The agent is the code-first Google ADK TypeScript / Gemini Enterprise Agent Platform worker that observes pending feedback, decides what to do next, uses tools, and records the result.

SignalGen should not require the founder to write a prompt such as “analyze these screenshots.” The default interaction is event-driven: the founder uploads screenshots or connects a feedback source, and the agent knows to evaluate whether the feedback contains enough repeated evidence to justify a bug fix or feature proposal.

---

## 3. Google ADK TypeScript / Gemini Enterprise Agent Platform setup strategy

Chosen approach: **Option B — code-first agent with Google Agent Development Kit (ADK) TypeScript and Gemini Enterprise Agent Platform / Agent Engine**.

This means SignalGen should be built primarily **in code and CLI**, not only through a low-code web UI. The Google Cloud Console is still used for project setup, API enablement, service accounts, Secret Manager, and checking deployed resources, but the agent itself should live in the repo as versioned code.

### Why code-first

Code-first is the best fit because SignalGen needs:

- A custom dashboard and approval workflow.
- Event-driven and periodic processing instead of only chat sessions.
- Real tool calls to MongoDB MCP, GitHub, Vercel, and SignalGen APIs.
- Guardrails that are testable and reviewable in GitHub.
- A clear demo story where the agent acts on pending feedback without the founder prompting every step.

### Setup surfaces

| Setup surface | What it is used for |
| --- | --- |
| Google Cloud Console / UI | Create project, enable billing/APIs, inspect Agent Engine, manage IAM, inspect logs, configure Secret Manager values if needed |
| `gcloud` CLI | Authenticate locally, set project, enable APIs, deploy services/agents, inspect logs |
| Repo code | Define the ADK agent, tools, prompts/instructions, guardrails, tests, and deployment config |
| SignalGen dashboard | Upload feedback, show agent decisions, approve plans, and display PR/preview/history |

### Beginner-friendly setup order

1. In Google Cloud Console, confirm project `signalgen-496700` is selected.
2. Confirm billing/free credits are active and set a budget alert.
3. Follow the current Gemini Enterprise Agent Platform documentation for Google Cloud setup. Do **not** assume old Vertex AI API setup instructions are current.
4. Enable only the currently documented services needed for the chosen path, likely including:
   - Gemini Enterprise Agent Platform / Agent Engine services available in the project
   - Cloud Run API, if we deploy an agent worker or API bridge there
   - Cloud Scheduler API, if we run periodic checks
   - Secret Manager API, if we store tokens in Google Cloud
   - Cloud Storage API, if screenshots are stored in Google Cloud Storage
5. For local ADK TypeScript development, follow the official ADK TypeScript quickstart and API-key setup: <https://adk.dev/get-started/typescript/#set-your-api-key>. The current ADK TypeScript quickstart uses `GEMINI_API_KEY` in the agent `.env` file, created from Google AI Studio.
6. Locally, authenticate with `gcloud` and set the project for Google Cloud deployment/inspection:

   ```bash
   gcloud auth login
   gcloud config set project signalgen-496700
   gcloud auth application-default login
   ```

7. Add an `agent/` package in this repo for the code-first ADK TypeScript agent.
8. Define the agent instructions and tools in TypeScript code.
9. Run the agent locally against a test run with ADK devtools.
10. Deploy the agent to Gemini Enterprise Agent Platform / Agent Engine or a Cloud Run bridge, depending on the final documented ADK deployment path.
11. Add `/api/agent/tick` in the Next.js app so the dashboard, upload event, or Cloud Scheduler can trigger the agent.
12. Connect Cloud Scheduler to call `/api/agent/tick` periodically.

### Planned repo structure

```text
agent/
  package.json             # ADK TypeScript package config
  tsconfig.json
  .env.example             # documents GEMINI_API_KEY without storing the real value
  src/
    agent.ts               # ADK LlmAgent definition and instructions
    schemas.ts             # structured output types/schemas
    tools/
      runs.ts              # list/get/update SignalGen runs
      extraction.ts        # screenshot/comment extraction
      signals.ts           # classify, cluster, score evidence
      memoryMcp.ts         # MongoDB MCP memory operations
      github.ts            # branch/PR actions after approval
      vercel.ts            # preview lookup
  tests/
    signalScoring.test.ts
    guardrails.test.ts
```

The exact package names can change during implementation, but the principle should remain: the agent and its tools are source-controlled, testable TypeScript code. ADK setup should follow the official TypeScript docs, including `npm install @google/adk`, `npm install -D @google/adk-devtools`, and a local agent `.env` with `GEMINI_API_KEY` for Gemini API access.

### How the dashboard invokes the agent

The dashboard and API should not contain all the intelligence. They should create runs and trigger the agent.

Suggested route:

```text
POST /api/agent/tick
```

Purpose:

```text
Tell the code-first agent to inspect pending runs, advance each run by one safe step, and write updated state back to MongoDB.
```

Trigger sources:

- Immediately after a founder uploads screenshots.
- Manually from an admin/dashboard button for demos.
- Periodically through Cloud Scheduler.

### Gemini Enterprise Agent Platform / Agent Engine role

Gemini Enterprise Agent Platform / Agent Engine should host/scale the code-first agent runtime. Its job is to run the agent loop and tool calls, not to replace the SignalGen dashboard.

Agent Engine responsibilities:

- Run the ADK agent.
- Use Gemini models for reasoning and multimodal understanding.
- Orchestrate tool calls.
- Keep agent instructions and execution observable through Google Cloud.
- Scale beyond local development when the workflow is deployed.

### Google Cloud Console role

Use the web UI for setup and inspection, not as the source of truth for the agent logic:

- Enable APIs.
- Check billing/budget.
- Review Agent Engine deployments.
- Review Cloud Run / Cloud Scheduler / logs.
- Manage service accounts and IAM.
- Optionally manage secrets in Secret Manager.

### MVP deployment decision

For the first working integration, use the simplest deployable path:

1. Build the ADK TypeScript agent locally in `agent/`.
2. Trigger it from `/api/agent/tick` or a local script.
3. Once local behavior works, deploy to Gemini Enterprise Agent Platform / Agent Engine if the ADK deployment flow is stable in the project.
4. If Agent Engine deployment is blocked, deploy a thin Cloud Run worker that runs the ADK TypeScript agent and still uses Gemini APIs / Google Cloud services. Document the fallback clearly.

The hackathon story should still emphasize the code-first Google agent architecture: ADK TypeScript for agent definition, Gemini for reasoning, Gemini Enterprise Agent Platform / Agent Engine or Cloud Run for hosted execution, and MongoDB MCP for memory.

---

## 4. Core data model

### `runs` collection

Each SignalGen run represents one product iteration loop.

Suggested shape:

```ts
type SignalGenRun = {
  _id: string;
  source: "dashboard_upload" | "watched_folder" | "manual_seed";
  status:
    | "uploaded"
    | "ocr_completed"
    | "signals_clustered"
    | "insufficient_evidence"
    | "signal_detected"
    | "plan_ready"
    | "waiting_for_approval"
    | "approved"
    | "branch_created"
    | "changes_committed"
    | "checks_running"
    | "pr_created"
    | "preview_ready"
    | "merged"
    | "rejected"
    | "needs_review";

  screenshotNames: string[];
  screenshots?: ScreenshotAsset[];
  extractedComments: ExtractedComment[];
  signalClusters?: SignalCluster[];
  topSignal?: ProductSignal;
  implementationPlan?: ImplementationPlan;
  approval?: ApprovalDecision;
  repoWork?: RepoWork;
  verification?: VerificationResult;
  pr?: PullRequestInfo;
  preview?: VercelPreviewInfo;
  errors?: RunError[];

  createdAt: string;
  updatedAt: string;
};
```

### Screenshot asset

```ts
type ScreenshotAsset = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageProvider: "vercel_blob" | "google_cloud_storage" | "mongodb_gridfs";
  storageUrl: string;
  uploadedAt: string;
};
```

Recommended first implementation: **Google Cloud Storage** or **Vercel Blob**.

For hackathon alignment with Google Cloud, Google Cloud Storage is a strong option. For fastest Vercel app implementation, Vercel Blob is simpler.

### Extracted comment

```ts
type ExtractedComment = {
  id: string;
  text: string;
  language?: string;
  sourceScreenshotId?: string;
  confidence?: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};
```

### Product signal

```ts
type ProductSignal = {
  title: string;
  summary: string;
  confidence: number;
  evidenceCommentIds: string[];
  whyItMatters: string;
  suggestedOpportunity: string;
};
```

### Signal cluster

SignalGen should evaluate repeated feedback before proposing a product change.

```ts
type SignalCluster = {
  id: string;
  type: "bug" | "feature_request" | "friction" | "trust_objection" | "pricing" | "praise" | "noise";
  title: string;
  summary: string;
  evidenceCommentIds: string[];
  severity: "low" | "medium" | "high";
  frequency: number;
  confidence: number;
  decision: "store_only" | "needs_more_evidence" | "propose_plan" | "urgent_review";
  rationale: string;
};
```

Evidence threshold rules should start simple and be visible to the founder:

- Propose a plan when 3+ related comments show the same feature request or friction.
- Propose a plan when 2+ related comments describe a high-severity bug.
- Mark `urgent_review` for one severe bug affecting a core workflow.
- Mark `store_only` for isolated preferences, vague complaints, generic praise, or low-confidence extraction.


### Implementation plan

```ts
type ImplementationPlan = {
  title: string;
  summary: string;
  targetRepo: {
    owner: string;
    name: string;
  };
  proposedBranchName: string;
  proposedFiles: string[];
  steps: string[];
  acceptanceCriteria: string[];
  guardrails: string[];
  outOfScope: string[];
};
```

### Approval decision

```ts
type ApprovalDecision = {
  status: "approved" | "rejected" | "changes_requested";
  decidedBy: string;
  decidedAt: string;
  note?: string;
};
```

### Repo work

```ts
type RepoWork = {
  targetRepo: string;
  branchName: string;
  commitSha?: string;
  changedFiles: string[];
};
```

### Verification result

```ts
type VerificationResult = {
  status: "not_started" | "running" | "passed" | "failed";
  commands: Array<{
    command: string;
    status: "passed" | "failed";
    summary: string;
  }>;
  completedAt?: string;
};
```

---

## 5. Feature milestones

### Milestone 1: Foundation — complete

Status: implemented.

Includes:

- Next.js app
- Landing page
- Dashboard shell
- MongoDB helper
- Run create/list API
- Vercel deployment
- Production MongoDB connectivity

Verification already completed:

- `npm run lint`
- `npm run build`
- Production `/api/health`
- Production `/api/runs`
- Production dashboard load

### Milestone 2: Code-first ADK TypeScript agent skeleton

Goal: Create a versioned Google ADK TypeScript agent in the repo and connect it to SignalGen's run state.

User flow:

1. Founder uploads screenshots or creates a run.
2. `/api/agent/tick` triggers the agent.
3. The agent finds pending runs and advances them by one safe step.
4. The dashboard shows agent status and decisions.

Implementation tasks:

- Create `agent/` package.
- Define SignalGen agent instructions.
- Add tool stubs for listing runs, updating runs, classifying feedback, and writing memory.
- Add local test fixtures for signal scoring and guardrails.
- Add a manual local command to run one agent tick.

### Milestone 3: Real screenshot upload

Goal: Store real screenshot files instead of only screenshot names.

User flow:

1. User selects images on dashboard.
2. Browser uploads files to storage.
3. API creates a run with screenshot asset metadata.
4. Dashboard shows uploaded assets.

Technical options:

| Option | Pros | Cons |
| --- | --- | --- |
| Google Cloud Storage | Strong hackathon fit; durable; scalable | More setup and service account complexity |
| Vercel Blob | Fastest with Vercel app | Less Google Cloud story |
| MongoDB GridFS | Keeps assets near metadata | More complex and not ideal for serverless image handling |

Recommended path:

- Use Google Cloud Storage if setup time allows.
- Otherwise use Vercel Blob for upload speed, while still using Google Cloud for Gemini/OCR.

API design:

```text
POST /api/uploads
  accepts multipart form data
  stores image
  returns ScreenshotAsset[]

POST /api/runs
  accepts screenshot asset IDs/metadata
  creates run with status uploaded
```

### Milestone 4: OCR extraction

Goal: Extract comments from screenshots.

Recommended implementation choices:

1. **Gemini multimodal extraction**: send image to Gemini and ask for structured JSON comments.
2. **Google Cloud Vision OCR**: run OCR first, then use Gemini to structure comments.

For hackathon clarity, Gemini multimodal may be simpler and more agentic. Vision OCR may be more explainable as a dedicated OCR step.

Suggested route:

```text
POST /api/runs/:id/extract-comments
```

Responsibilities:

- Load screenshot assets.
- Call OCR/Gemini.
- Normalize comments.
- Store `extractedComments`.
- Update run status to `ocr_completed`.

Structured output target:

```json
{
  "comments": [
    {
      "text": "I am worried this product sounds too generic.",
      "language": "en",
      "confidence": 0.92
    }
  ]
}
```

### Milestone 5: Signal clustering and evidence scoring with Gemini

Goal: Convert extracted comments into classified feedback clusters, then decide whether any bug/feature/friction cluster has enough evidence to justify action.

Suggested route:

```text
POST /api/runs/:id/detect-signal
```

Gemini/ADK logic should ask for:

- Comment classification: bug, feature request, friction, trust objection, pricing, praise, or noise.
- Clusters of repeated comments.
- Evidence comment IDs for every cluster.
- Severity, frequency, confidence, and rationale.
- Decision: `store_only`, `needs_more_evidence`, `propose_plan`, or `urgent_review`.

Important constraints:

- Do not invent evidence.
- Every signal cluster must cite extracted comments.
- If evidence is too weak, store the cluster as memory instead of forcing a plan.
- If a signal is strong enough, create a plan and set status to `plan_ready`.
- If a possible issue is severe but low-frequency, set status to `needs_review`.

### Milestone 6: Implementation plan generation

Goal: Turn the detected signal into a small, safe product-specific implementation plan.

Suggested route:

```text
POST /api/runs/:id/generate-plan
```

Plan constraints:

- Target repo must match the configured allowlisted product repo.
- Plan must be small enough for one PR.
- Plan must include acceptance criteria.
- Plan must include guardrails and out-of-scope items.
- Plan should prefer low-risk UI/content/product changes first.

Example acceptance criteria:

```text
- Landing page addresses the customer concern using clear, specific product messaging.
- New section is visible on desktop and mobile.
- Build passes.
- No secrets or unrelated files are changed.
```

### Milestone 7: Founder approval workflow

Goal: Require explicit approval before repo edits.

Dashboard changes:

- Add Approve button.
- Add Reject button.
- Add Request changes note field.
- Show warning that approval allows branch/PR automation.

Suggested route:

```text
POST /api/runs/:id/approval
```

Request body:

```json
{
  "decision": "approved",
  "note": "Looks good. Keep the change limited to landing page copy."
}
```

Rules:

- Only approved runs can trigger repo automation.
- Rejected runs stay stored for memory.
- Approval should store timestamp and decision note.

### Milestone 8: GitHub PR automation

Goal: Create a branch and PR in the configured product repo after approval.

Implementation options:

1. GitHub REST API from the Vercel server.
2. GitHub App for more secure installation-based access.
3. Local/worker agent that uses `gh` and git.

For a hackathon MVP, GitHub REST API or a controlled local worker is acceptable. For production, prefer a GitHub App.

Suggested route:

```text
POST /api/runs/:id/create-pr
```

Steps:

1. Validate run is approved.
2. Validate target repo allowlist.
3. Create branch with prefix `signalgen/`.
4. Apply the planned change.
5. Commit changes.
6. Open PR.
7. Store PR metadata in MongoDB.
8. Update status to `pr_created`.

PR body should include:

- SignalGen run ID
- Customer signal
- Evidence comments
- Plan summary
- Verification status
- Vercel preview placeholder/link

Security rules:

- Never expose GitHub token in client-side code.
- Store token only in Vercel environment variables.
- Only use token server-side.
- Never commit `.env.local`.
- Only allow configured repo and branch prefixes.

### Milestone 9: Verification runner

Goal: Run build/tests before PR is considered ready.

Possible approaches:

1. Use GitHub Actions in the product repo after PR creation.
2. Use a controlled background worker that checks out the product repo and runs commands.
3. Use Vercel build status as partial verification.

Recommended MVP:

- Create PR.
- Let GitHub/Vercel run checks.
- Poll GitHub check runs or ask user to inspect status manually.
- Store status when available.

Longer-term:

- Add a dedicated worker for deterministic test/build execution.

### Milestone 10: Vercel preview capture

Goal: Display preview URL in SignalGen.

Possible approaches:

1. Read GitHub deployments/checks linked to the PR.
2. Use Vercel API to list deployments by git branch or commit SHA.
3. Ask founder to paste preview URL as a fallback.

Recommended MVP:

- Use Vercel API if token is available.
- Otherwise show PR link and explain that preview appears in GitHub/Vercel.

Suggested stored object:

```ts
type VercelPreviewInfo = {
  status: "pending" | "ready" | "failed";
  url?: string;
  deploymentId?: string;
  updatedAt: string;
};
```

---

## 6. API route plan

Suggested API routes:

These routes are not meant to replace the agent. The main product path is `/api/agent/tick`, which lets the ADK TypeScript / Gemini Enterprise Agent Platform worker choose the next safe step. The run-specific routes can be used as internal tools, debug/admin endpoints, or fallback manual endpoints during MVP development.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/health` | `GET` | Verify app and MongoDB connectivity |
| `/api/runs` | `GET` | List latest runs |
| `/api/runs` | `POST` | Create run |
| `/api/uploads` | `POST` | Upload screenshots |
| `/api/agent/tick` | `POST` | Trigger the code-first ADK agent to process pending runs |
| `/api/runs/[id]` | `GET` | Get run details |
| `/api/runs/[id]/extract-comments` | `POST` | OCR/Gemini extraction |
| `/api/runs/[id]/detect-signal` | `POST` | Gemini signal detection |
| `/api/runs/[id]/generate-plan` | `POST` | Generate implementation plan |
| `/api/runs/[id]/approval` | `POST` | Save founder decision |
| `/api/runs/[id]/create-pr` | `POST` | Trigger repo automation |
| `/api/runs/[id]/preview` | `POST` or `GET` | Fetch/store Vercel preview |

---

## 7. Agent behavior design

SignalGen should behave like an event-driven product agent, not a prompt-driven form workflow.

The founder should not need to say, “Analyze these screenshots and propose a safe product improvement.” The normal flow is:

```text
Founder uploads feedback screenshots or connects a feedback source.
SignalGen creates a pending run.
The ADK TypeScript / Gemini Enterprise Agent Platform agent wakes up immediately or periodically.
The agent reads all pending comments and decides what, if anything, deserves action.
```

Agent loop:

```text
Watch feedback → extract comments → classify → cluster → compare with memory → score evidence → decide → plan if warranted → ask approval → act through tools → verify → record memory
```

Agent responsibilities:

- Monitor pending runs created by uploads or scheduled checks.
- Read screenshots/comments.
- Classify comments into bugs, feature requests, friction, trust objections, pricing concerns, praise, or noise.
- Cluster related comments across the current run and historical MongoDB memory.
- Decide whether a cluster has enough evidence to act.
- Store weak or isolated signals without forcing action.
- Explain evidence and cite comment IDs.
- Propose small implementation plans only for sufficiently supported signals.
- Respect guardrails.
- Wait for approval before code or PR actions.
- Make repo changes only after approval.
- Run checks or collect check status.
- Store everything in MongoDB memory, preferably through MongoDB MCP for the agent-facing memory layer.

Decision outcomes:

| Decision | Meaning | Status |
| --- | --- | --- |
| `store_only` | Feedback is useful memory but not actionable yet | `insufficient_evidence` |
| `needs_more_evidence` | Pattern exists but is not strong enough | `insufficient_evidence` |
| `propose_plan` | Evidence is strong enough for a safe product change proposal | `plan_ready` |
| `urgent_review` | A severe bug may need human review even with limited evidence | `needs_review` |

Core state transitions:

```text
uploaded
  → ocr_completed
  → signals_clustered
  → insufficient_evidence | needs_review | plan_ready
  → waiting_for_approval
  → approved | rejected
  → branch_created
  → changes_committed
  → checks_running
  → pr_created
  → preview_ready
  → merged
```

Agent non-goals:

- Do not directly merge PRs.
- Do not deploy to production without founder action.
- Do not edit arbitrary repos.
- Do not scrape risky/private platforms directly for MVP.
- Do not generate launch posts as a core workflow.
- Do not create product changes from weak evidence just to look active.

---

## 8. Guardrails

### Repository guardrails

- Allowed repo: the configured product repo only.
- Branch prefix: `signalgen/`.
- PR required for every code change.
- No direct push to main.
- Founder manually reviews and merges.

### File guardrails for early MVP

Start with a narrow allowlist, for example:

```text
src/app/page.tsx
src/app/globals.css
README.md
```

Expand only after the agent is reliable.

### Secret guardrails

- Never print environment variable values.
- Never expose tokens in browser code.
- Never commit `.env.local`.
- Redact secrets in logs as `[REDACTED]`.

### Product guardrails

- Plans must cite evidence comments.
- If confidence is low, request human review.
- Keep changes small and reversible.
- Avoid destructive migrations or production data changes in the MVP.

---

## 9. Environment variables

Expected environment variables as features are added:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string for product memory |
| `GOOGLE_CLOUD_PROJECT` | Google Cloud project ID, currently `signalgen-496700`, used for deployment/inspection |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local Google application credentials only if required by the current Gemini Enterprise Agent Platform deployment path |
| `GEMINI_API_KEY` | Gemini API access for ADK TypeScript local development; follow the official ADK TypeScript API-key setup docs |
| `GITHUB_TOKEN` | Server-side GitHub access for approved PR automation |
| `TARGET_REPO_OWNER` | Owner/org of the configured product repo |
| `TARGET_REPO_NAME` | Name of the configured product repo |
| `VERCEL_TOKEN` | Server-side Vercel API access for preview lookup |
| `VERCEL_TEAM_ID` | Optional Vercel team identifier |
| `VERCEL_PROJECT_ID` | Optional Vercel project identifier |
| `AGENT_TICK_SECRET` | Shared secret used by Cloud Scheduler or internal triggers for `/api/agent/tick` |
| `GOOGLE_CLOUD_LOCATION` | Google Cloud region, for example `us-central1` |

Notes:

- `MONGODB_URI` is already used.
- `GOOGLE_CLOUD_PROJECT` is already used by health output.
- Tokens must only be available server-side.
- Do not print or commit secret values.
- For Vercel production, set environment variables in the Vercel project settings and redeploy.

---

## 10. Suggested implementation order

Recommended next build sequence:

1. Add the code-first ADK agent skeleton under `agent/`.
2. Add `/api/agent/tick` so uploads, manual demo buttons, and Cloud Scheduler can trigger the agent loop.
3. Add signal classification, clustering, and evidence scoring using Gemini.
4. Add MongoDB MCP memory access for the agent-facing memory layer.
5. Add real file upload storage.
6. Add OCR/Gemini multimodal extraction.
7. Add run detail page or richer dashboard selected-run panel.
8. Add approve/reject workflow.
9. Add GitHub PR automation for one narrow allowed change.
10. Add Vercel preview capture.
11. Add run status timeline and error visibility.
12. Polish demo script and judge-facing documentation.

This order proves the agent architecture early: the dashboard creates feedback runs, the code-first Google agent processes them, MongoDB MCP gives memory, and the founder remains in control before any code changes happen.

---

## 11. Testing and verification strategy

### Local checks

For every change:

```bash
npm run lint
npm run build
```

### API checks

Health:

```bash
curl -i http://localhost:3000/api/health
```

Runs:

```bash
curl -i http://localhost:3000/api/runs
```

### Production checks

```bash
curl -i https://signalgen-delta.vercel.app/api/health
curl -i https://signalgen-delta.vercel.app/api/runs
```

### Manual dashboard checks

1. Open `/dashboard`.
2. Confirm page loads.
3. Select one or more screenshots.
4. Create a run.
5. Confirm run appears in latest run panel.
6. Confirm run appears in history.
7. Confirm no browser console errors.

### Future test coverage

Add tests for:

- Run creation validation
- MongoDB helper behavior
- OCR response parsing
- Gemini structured output validation
- Approval state transitions
- Guardrail validation before repo automation
- PR payload generation

---

## 12. Open technical decisions

### Storage provider

Decision needed: Google Cloud Storage vs Vercel Blob for image assets.

Recommendation: choose based on hackathon scoring and setup speed. If Google Cloud usage is important, pick Google Cloud Storage.

### Gemini integration style

Decision: use the current ADK TypeScript + Gemini API path documented by ADK for local development, and follow Gemini Enterprise Agent Platform documentation for Google Cloud deployment. Do **not** use outdated Vertex AI API setup instructions as the source of truth.

Recommendation: keep the model/provider setup small for MVP: `GEMINI_API_KEY` for local ADK TypeScript development, then only add Google Cloud service-account or platform-specific deployment configuration when required by the current Gemini Enterprise Agent Platform docs.

### Agent execution environment

Decision: use a **code-first Google ADK TypeScript agent**, then deploy it to **Gemini Enterprise Agent Platform / Agent Engine** when ready.

Implementation guidance:

- Define agent logic and tools in the repo under `agent/`.
- Use local CLI workflows for development and tests.
- Use Google Cloud Console for API enablement, IAM, logs, and deployment inspection.
- Use Agent Engine for hosted execution if available/stable for the project.
- Use Cloud Run as a fallback worker if Agent Engine deployment blocks the MVP.
- Keep repo-changing actions behind founder approval.

### Authentication

MVP may be single-user without full auth. Before wider use, add authentication so only the founder can approve actions.

---

## 13. Success criteria for the hackathon MVP

A strong MVP should demonstrate:

- Founder uploads feedback screenshots or leaves uploaded feedback for the periodic agent loop.
- Code-first Google ADK TypeScript / Gemini Enterprise Agent Platform agent processes pending feedback without needing a manual analysis prompt.
- SignalGen extracts real comments.
- Gemini classifies and clusters bugs, feature requests, and friction points.
- Agent decides whether the evidence is strong enough to act.
- MongoDB MCP provides the agent-facing product memory layer.
- SignalGen generates a safe implementation plan only when evidence is strong enough.
- Founder approves the plan before code actions.
- SignalGen creates a GitHub PR for your product repo.
- Vercel preview is linked.
- MongoDB stores the full loop as durable product memory.

The most important narrative:

> SignalGen helps a founder move from scattered customer comments to a reviewed product change, while preserving the reasoning trail behind every iteration.
