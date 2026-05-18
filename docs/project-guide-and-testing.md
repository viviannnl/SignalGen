# SignalGen Project Guide and User Testing Checklist

## What SignalGen does

SignalGen is a founder product-iteration agent. It turns real customer/social feedback screenshots into a structured product-memory loop:

```text
Screenshot feedback
→ Gemini multimodal comment extraction
→ MongoDB run memory
→ agent tick classification/clustering
→ evidence-backed product signal
→ founder approval/rejection
→ guarded implementation job
→ PR draft preparation
```

The current implementation is intentionally safe: it records the approved implementation path and PR draft, but it does **not** edit a product repository or create a live GitHub PR yet.

## Live app

- Production dashboard: `https://signalgen-delta.vercel.app/dashboard`
- Production home page: `https://signalgen-delta.vercel.app`

## Current feature map

### 1. Landing page

Explains SignalGen as a product-iteration agent and links to the dashboard.

### 2. Dashboard screenshot upload

The founder uploads PNG, JPG, or WebP screenshots. Upload limits:

- maximum 5 screenshots per run
- maximum 4 MB per image
- maximum 8 MB total
- validates image signatures, not just file extensions

### 3. Gemini extraction

`POST /api/runs` accepts multipart screenshots and calls Gemini multimodal extraction. The run stores extracted visible comments in MongoDB.

### 4. Agent tick

`POST /api/agent/tick` classifies and clusters extracted comments. Strong repeated evidence becomes `plan_ready`.

Current evidence threshold examples:

- 3+ related feature/friction/trust comments → `plan_ready`
- 2+ high-severity bug comments → `plan_ready`
- weak/noisy feedback → `insufficient_evidence` or `needs_review`

### 5. Founder approval gate

For `plan_ready` runs, the dashboard shows:

- **Approve plan**
- **Reject plan**

The decision is stored in MongoDB as:

```json
{
  "action": "approve",
  "note": "optional founder note",
  "decidedAt": "timestamp",
  "decidedBy": "dashboard_founder"
}
```

### 6. Guarded implementation job

For approved runs, the dashboard shows **Start guarded implementation**. This creates an auditable implementation record:

- `status: queued`
- branch name
- summary
- guardrails
- created timestamp
- creator

This step does not edit code or create a real PR.

### 7. PR draft preparation

For queued implementation jobs, the dashboard shows **Prepare PR draft**. This changes implementation status to `ready_for_pr` and stores:

- PR title
- PR body
- branch name
- checklist
- preview placeholder

This gives the next coding/PR agent a safe, reviewable handoff.

## How to test as a user

### Test 1: Open the app

1. Go to `https://signalgen-delta.vercel.app`.
2. Confirm the home page loads.
3. Click the dashboard link or open `https://signalgen-delta.vercel.app/dashboard`.

Expected result:

- Dashboard loads with the heading **Founder signal dashboard**.
- No visible error banner appears.

### Test 2: Upload feedback screenshots

1. On the dashboard, click **Drop or choose screenshots**.
2. Select a PNG/JPG/WebP screenshot containing visible feedback comments.
3. Click **Upload and run agent**.

Expected result:

- Button changes while Gemini extracts comments and the agent processes the run.
- A new run appears in **Latest memory**.
- **Extracted comments** shows comments from the screenshot.

Troubleshooting:

- If you see a Gemini quota/billing error, check Google AI Studio credits/billing.
- If the file is rejected, confirm it is PNG/JPG/WebP and under the size limits.

### Test 3: Confirm signal detection

Use a screenshot with repeated requests such as:

```text
Can you add CSV export?
We need export feature for reports.
Would love CSV export integration.
```

Expected result:

- Top signal: **Repeated feature request detected**.
- Status: `plan_ready`.
- Evidence contains the related comments.
- Agent rationale explains why the evidence was strong enough.

### Test 4: Approve a plan

1. Find a `plan_ready` run.
2. Click **Approve plan**.
3. Enter an optional note, or leave it blank.
4. Submit the browser prompt.

Expected result:

- Status becomes `approved`.
- Founder decision panel shows **Approved**.
- Run history shows the decision timestamp.

### Test 5: Reject a plan

1. Find another `plan_ready` run.
2. Click **Reject plan**.
3. Add an optional rejection note.

Expected result:

- Status becomes `rejected`.
- Founder decision panel shows **Rejected**.
- No implementation controls appear for rejected runs.

### Test 6: Start guarded implementation

1. Use an approved run.
2. Click **Start guarded implementation**.

Expected result:

- Implementation memory appears.
- Status becomes `queued`.
- A branch name is shown.
- Guardrail copy confirms no code has been edited yet.

### Test 7: Prepare PR draft

1. Use an approved run with queued implementation.
2. Click **Prepare PR draft**.

Expected result:

- Implementation status becomes `ready_for_pr`.
- PR draft title appears.
- PR branch appears.
- Checklist appears.

### Test 8: Verify safety guardrails

Expected safety behavior:

- You cannot approve/reject a run unless it is `plan_ready`.
- You cannot start implementation unless the run is `approved`.
- You cannot prepare a PR draft unless an implementation job is `queued`.
- Starting implementation does not create a real GitHub PR.
- Preparing a PR draft does not edit files in the target repo.

## Developer verification commands

Run from the repository root:

```bash
npm test
(cd agent && npm run typecheck && npm test && npx adk --help >/dev/null)
npm run lint
npm run build
git diff --check
```

Expected result:

- Root tests pass.
- Agent tests pass.
- Lint passes.
- Next.js build passes.
- No whitespace diff errors.

## Production smoke-test flow

Use a temporary feedback screenshot and clean up the test run afterward.

1. `GET /api/health` should return HTTP 200.
2. `POST /api/runs` with screenshot multipart data should return HTTP 201.
3. `POST /api/agent/tick` with the run ID should return HTTP 200.
4. `POST /api/runs/:runId/decision` with `{ "action": "approve" }` should return HTTP 200.
5. `POST /api/runs/:runId/implementation` should return HTTP 200.
6. `POST /api/runs/:runId/implementation/prepare-pr` should return HTTP 200.
7. Delete the temporary MongoDB test run.

## Known limitations

- No real user authentication yet; decisions are recorded as `dashboard_founder`.
- No real GitHub PR creation yet; current step creates a PR draft only.
- No real Vercel preview capture yet; preview is reserved for the future PR automation step.
- MongoDB MCP integration is still planned; current app uses the MongoDB Node driver.
- ADK agent skeleton exists, but the dashboard flow currently uses Next.js API routes for the quickest hackathon demo path.

## Future steps

1. Add authentication/session protection.
2. Convert PR drafts into real guarded GitHub branch + PR creation.
3. Capture Vercel preview URLs from real PRs.
4. Move long-running agent execution into Google ADK / Gemini Enterprise Agent Platform.
5. Add MongoDB MCP memory integration.
6. Add event-driven or scheduled agent ticks.
