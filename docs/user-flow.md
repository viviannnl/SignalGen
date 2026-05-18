# SignalGen User Flow Overview

**Goal:** Explain how a founder interacts with SignalGen from messy customer feedback to a safe, reviewable product PR.

**Audience:** Product reviewers, hackathon judges, future contributors, and anyone who wants to understand the product experience without reading code.

**One-line product promise:** SignalGen turns customer feedback screenshots into product signals, implementation plans, GitHub PRs, Vercel previews, and a durable memory layer of the founder's product iteration loop.

---

## 1. Who uses SignalGen?

The primary user is an early-stage founder or solo builder who is collecting product feedback from places like:

- Your social media comments
- Public replies and discussion threads
- Community messages
- Customer reviews
- Discord/Slack messages
- Customer emails or support screenshots
- User interview notes captured as screenshots

---

## 2. What problem does the user have?

Founders often have feedback scattered across many channels. The hard part is not only reading comments; it is deciding:

1. Which feedback is a real product signal?
2. Which signal is worth acting on now?
3. What exact product change should be made?
4. How can that change be implemented safely?
5. How can the founder remember why the change happened later?

SignalGen is designed to make this workflow concrete, reviewable, and traceable.

---

## 3. Main user experience

### Step 1: Founder opens the dashboard

The founder visits:

```text
https://signalgen-delta.vercel.app/dashboard
```

The dashboard is the control room for product iteration. It shows:

- Screenshot upload area
- Current SignalGen run
- Extracted comments
- Detected top product signal
- Implementation plan
- Approval status
- PR and preview links
- Historical runs stored in MongoDB

### Step 2: Founder uploads screenshots

The founder uploads screenshots of comments or customer feedback.

In the current milestone, the app stores screenshot names and creates a demo run. In the full product, the uploaded image files will be processed by OCR/Gemini.

Supported intended screenshot sources:

- Social comments
- App reviews
- Community discussions
- Feedback forms
- Customer messages

### Step 3: SignalGen extracts comments

SignalGen reads the screenshots and extracts the visible customer feedback.

Planned behavior:

- OCR identifies text in each screenshot.
- The app normalizes text into individual comments.
- Each comment keeps evidence metadata, such as source screenshot and extracted text region when available.

Example extracted comments:

```text
This feels too generic.
Can this sound more like our actual product voice?
I am not sure what makes this different from other tools.
I wish the page explained the value more clearly.
```

### Step 4: SignalGen detects the strongest product signal

Gemini analyzes the extracted comments and identifies the highest-leverage product signal.

Example top signal:

```text
Users are worried your product output sounds too generic or obviously AI-written.
```

The dashboard should show:

- Top signal
- Confidence score
- Supporting comments
- Why this matters
- Suggested product opportunity

### Step 5: SignalGen generates an implementation plan

SignalGen turns the top signal into a small product change proposal.

For your product, an example plan could be:

```text
Add a clearer trust/value section to the product landing page explaining how the product addresses the concern found in customer feedback.
```

The plan should include:

- User problem
- Proposed product change
- Files likely to change
- Acceptance criteria
- Risks
- Guardrails
- Test/build checks to run

### Step 6: Founder reviews and approves

No code changes should happen automatically before approval.

The founder can:

- Approve the plan
- Reject the plan
- Request changes
- Save the signal for later

This is important because SignalGen is not just a chatbot; it is an agent that can eventually touch a real product repo. Human approval is the safety gate.

### Step 7: SignalGen edits the product repo under guardrails

After approval, SignalGen creates a controlled branch in the target repo.

Configured target repo:

```text
your-org/your-product-repo
```

Guardrails:

- Only the configured target repo can be edited.
- Code changes happen on a new branch, not directly on main.
- The branch name should clearly identify the SignalGen run.
- The agent should only edit allowed files for the current milestone.
- Secrets and environment files must never be printed or committed.
- The founder manually reviews and merges the PR.

### Step 8: SignalGen runs verification

Before creating or marking a PR as ready, SignalGen should run the relevant checks for the target product.

For a typical Next.js product, this may include:

```bash
npm run lint
npm run build
```

Later versions may also run tests, visual checks, or accessibility checks.

### Step 9: SignalGen opens a GitHub PR

SignalGen creates a GitHub pull request that contains:

- Summary of the customer signal
- Evidence comments
- Implementation plan
- Files changed
- Verification results
- Link back to the SignalGen run

The PR is where the founder reviews the actual code change.

### Step 10: SignalGen links the Vercel preview

If your product is connected to Vercel, a branch/PR can generate a preview deployment.

SignalGen should store and display the preview URL when available so the founder can click through and inspect the product change.

### Step 11: SignalGen stores the full iteration memory

MongoDB stores the full chain:

```text
screenshots → extracted comments → top signal → plan → approval decision → branch → tests/build → PR → preview → final status
```

This becomes the **memory layer of the founder's product iteration loop**.

The founder can later answer questions like:

- Why did we make this change?
- Which customer comments supported it?
- Who approved it?
- What PR implemented it?
- Did the preview/build pass?
- Was it merged, rejected, or saved for later?

---

## 4. Dashboard states

A SignalGen run should move through these states:

| State | Meaning | User-visible result |
| --- | --- | --- |
| `uploaded` | Screenshots were uploaded | Run appears in dashboard |
| `ocr_completed` | Comments were extracted | Extracted comments appear |
| `signal_detected` | Gemini found the top signal | Signal and evidence appear |
| `plan_ready` | Implementation plan was generated | Founder can approve/reject |
| `approved` | Founder approved the plan | Agent can start repo work |
| `branch_created` | Product repo branch was created | Branch link appears |
| `changes_committed` | Code change was committed | Commit link appears |
| `checks_running` | Build/tests are running | Verification status appears |
| `pr_created` | GitHub PR was opened | PR link appears |
| `preview_ready` | Vercel preview is available | Preview link appears |
| `merged` | Founder merged the PR | Run marked completed |
| `rejected` | Founder rejected the plan or PR | Run remains in memory |
| `needs_review` | Something requires human attention | Error/review note appears |

---

## 5. What the current app already supports

Current foundation milestone:

- Landing page
- Dashboard page
- MongoDB connection
- `/api/health`
- `/api/runs`
- Create demo SignalGen runs from selected screenshot names
- Store/retrieve run history from MongoDB Atlas
- Production deployment on Vercel

Current live URLs:

```text
Production: https://signalgen-delta.vercel.app
Dashboard: https://signalgen-delta.vercel.app/dashboard
```

---

## 6. What is intentionally not automatic yet

The current app does **not** yet:

- Store real uploaded image files
- Run real OCR
- Call Gemini for real signal detection
- Generate real implementation plans with Gemini
- Ask for approval through a completed workflow
- Edit your product automatically
- Open GitHub PRs automatically
- Fetch Vercel preview links automatically

Those are planned features documented in `docs/technical-design.md`.

---

## 7. Demo story for judges

A clear hackathon demo flow:

1. Show messy feedback screenshots from your social media or customer channels.
2. Upload them to SignalGen.
3. Show extracted comments.
4. Show Gemini-detected top signal.
5. Show the generated implementation plan.
6. Approve the plan.
7. Show SignalGen creating a branch and PR for your product repo.
8. Open the Vercel preview.
9. Return to SignalGen and show the MongoDB memory entry that connects feedback, decision, PR, and preview.

The key message:

> SignalGen is not only generating text. It is closing the loop between customer feedback, founder judgment, safe code changes, and long-term product memory.
