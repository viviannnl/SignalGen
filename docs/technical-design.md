# SignalGen Technical Design

**Goal:** Define how SignalGen will be built from the current MongoDB-backed dashboard into a full AI product-iteration agent.

**Audience:** Developers, hackathon reviewers, and future AI coding agents implementing the next milestones.

**Product summary:** SignalGen turns customer feedback screenshots into safe, reviewable product PRs for your product, while MongoDB stores the memory layer of the founder's product iteration loop.

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
MongoDB Atlas memory layer
  ↓
Google Cloud OCR / Gemini / Agent Builder
  ↓
GitHub API or GitHub App
  ↓
Product repo branch + PR
  ↓
Vercel preview deployment
  ↓
SignalGen dashboard status updates
```

SignalGen should treat the dashboard as the control plane and MongoDB as the source of truth for each product iteration run.

---

## 3. Core data model

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
    | "signal_detected"
    | "plan_ready"
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

## 4. Feature milestones

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

### Milestone 2: Real screenshot upload

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

### Milestone 3: OCR extraction

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

### Milestone 4: Signal detection with Gemini

Goal: Convert extracted comments into the strongest actionable product signal.

Suggested route:

```text
POST /api/runs/:id/detect-signal
```

Gemini prompt should ask for:

- The strongest repeated concern or opportunity
- Evidence comment IDs
- Confidence score
- Why this matters for the product
- What product change could address it

Important constraints:

- Do not invent evidence.
- Every signal must cite extracted comments.
- If comments are too weak, mark `needs_review` instead of forcing a plan.

### Milestone 5: Implementation plan generation

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

### Milestone 6: Founder approval workflow

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

### Milestone 7: GitHub PR automation

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

### Milestone 8: Verification runner

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

### Milestone 9: Vercel preview capture

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

## 5. API route plan

Suggested API routes:

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/health` | `GET` | Verify app and MongoDB connectivity |
| `/api/runs` | `GET` | List latest runs |
| `/api/runs` | `POST` | Create run |
| `/api/uploads` | `POST` | Upload screenshots |
| `/api/runs/[id]` | `GET` | Get run details |
| `/api/runs/[id]/extract-comments` | `POST` | OCR/Gemini extraction |
| `/api/runs/[id]/detect-signal` | `POST` | Gemini signal detection |
| `/api/runs/[id]/generate-plan` | `POST` | Generate implementation plan |
| `/api/runs/[id]/approval` | `POST` | Save founder decision |
| `/api/runs/[id]/create-pr` | `POST` | Trigger repo automation |
| `/api/runs/[id]/preview` | `POST` or `GET` | Fetch/store Vercel preview |

---

## 6. Agent behavior design

SignalGen should behave like an agent, not just a form workflow.

Agent loop:

```text
Observe feedback → reason over signals → propose plan → ask for approval → act through tools → verify → record memory
```

Agent responsibilities:

- Read screenshots/comments.
- Identify product signals.
- Explain evidence.
- Propose small implementation plans.
- Respect guardrails.
- Wait for approval.
- Make repo changes only after approval.
- Run checks or collect check status.
- Store everything in MongoDB.

Agent non-goals:

- Do not directly merge PRs.
- Do not deploy to production without founder action.
- Do not edit arbitrary repos.
- Do not scrape risky/private platforms directly for MVP.
- Do not generate launch posts as a core workflow.

---

## 7. Guardrails

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

## 8. Environment variables

Expected environment variables as features are added:

```bash
MONGODB_URI=
GOOGLE_CLOUD_PROJECT=signalgen-496700
GOOGLE_APPLICATION_CREDENTIALS=
GEMINI_API_KEY=
GITHUB_TOKEN=
TARGET_REPO_OWNER=your-org
TARGET_REPO_NAME=your-product-repo
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_ID=
```

Notes:

- `MONGODB_URI` is already used.
- `GOOGLE_CLOUD_PROJECT` is already used by health output.
- Tokens must only be available server-side.
- For Vercel production, set environment variables in the Vercel project settings and redeploy.

---

## 9. Suggested implementation order

Recommended next build sequence:

1. Add real file upload storage.
2. Add run detail page or richer dashboard selected-run panel.
3. Add OCR/Gemini extraction.
4. Add signal detection.
5. Add plan generation.
6. Add approve/reject workflow.
7. Add GitHub PR automation for one narrow allowed change.
8. Add Vercel preview capture.
9. Add run status timeline and error visibility.
10. Polish demo script and judge-facing documentation.

This order keeps the product demo useful at each milestone while avoiding unsafe code automation too early.

---

## 10. Testing and verification strategy

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

## 11. Open technical decisions

### Storage provider

Decision needed: Google Cloud Storage vs Vercel Blob for image assets.

Recommendation: choose based on hackathon scoring and setup speed. If Google Cloud usage is important, pick Google Cloud Storage.

### Gemini integration style

Decision needed: direct Gemini API vs Google Cloud Vertex AI Gemini.

Recommendation: use the Google Cloud-native path if the hackathon expects Google Cloud integration depth.

### Agent execution environment

Decision needed: run repo automation inside Vercel serverless routes, GitHub Actions, or a separate worker.

Recommendation:

- Vercel serverless is fine for short API calls.
- GitHub Actions or a separate worker is better for longer code edits/builds.
- For safety, keep the first PR automation very narrow.

### Authentication

MVP may be single-user without full auth. Before wider use, add authentication so only the founder can approve actions.

---

## 12. Success criteria for the hackathon MVP

A strong MVP should demonstrate:

- Founder uploads feedback screenshots.
- SignalGen extracts real comments.
- Gemini identifies a real product signal with evidence.
- SignalGen generates a safe implementation plan.
- Founder approves the plan.
- SignalGen creates a GitHub PR for your product repo.
- Vercel preview is linked.
- MongoDB stores the full loop as durable product memory.

The most important narrative:

> SignalGen helps a founder move from scattered customer comments to a reviewed product change, while preserving the reasoning trail behind every iteration.
