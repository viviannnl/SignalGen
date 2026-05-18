# SignalGen

**SignalGen** is an AI product-iteration agent for founders.

It turns customer feedback screenshots into safe, reviewable product PRs.

> From customer signal to product PR.

## Hackathon

Built for the **Google Cloud Rapid Agent Hackathon**.

## Target product workflow

1. Founder uploads screenshots of social comments or user feedback.
2. OCR extracts comments from screenshots.
3. Gemini detects the strongest product signal and shows supporting evidence.
4. SignalGen generates a small implementation plan with guardrails.
5. Founder approves the plan before code changes happen.
6. The agent edits the target product repo on a new branch.
7. The agent runs build/tests.
8. The agent opens a GitHub PR and links the Vercel preview.
9. MongoDB stores the full feedback-to-decision-to-PR chain as the memory layer of the founder’s product iteration loop.
10. The dashboard shows run history, evidence, PRs, previews, and founder decisions.

## Target product

SignalGen is designed to work with **your product repo**. The MVP should start with one configured product repository and expand only after the guardrails are reliable.

## Project docs

- [User flow overview](docs/user-flow.md) — how a founder interacts with SignalGen from screenshot upload to PR/preview/memory.
- [Technical design](docs/technical-design.md) — how the full system will be built across Next.js, MongoDB, Gemini Enterprise Agent Platform / ADK TypeScript, GitHub, and Vercel.
- [ADK TypeScript agent](agent/README.md) — local setup for the code-first SignalGen agent skeleton.

## Tech stack

- Next.js
- TypeScript
- Tailwind CSS
- Google ADK TypeScript
- Gemini Enterprise Agent Platform / Agent Engine
- Gemini API
- Google Cloud Vision OCR or Gemini multimodal extraction
- MongoDB Atlas
- MongoDB MCP memory integration (planned)
- GitHub PR automation
- Vercel previews

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Agent development

```bash
cd agent
cp .env.example .env
# Fill GEMINI_API_KEY and MONGODB_URI locally. Do not commit .env.
npm install
npm run typecheck
npm test
```

The ADK TypeScript API-key setup should follow the official docs:

https://adk.dev/get-started/typescript/#set-your-api-key

## Environment variables

Use `.env.local` for the Next.js app and `agent/.env` for the local ADK agent. Never commit real secret values.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string for product memory |
| `GOOGLE_CLOUD_PROJECT` | Google Cloud project identifier |
| `GEMINI_API_KEY` | Gemini API key for local ADK TypeScript development |
| `GITHUB_TOKEN` | Server-side GitHub access for approved PR automation |
| `TARGET_REPO_OWNER` | Owner/org of the configured product repo |
| `TARGET_REPO_NAME` | Name of the configured product repo |
| `VERCEL_TOKEN` | Server-side Vercel API access for preview lookup |
| `AGENT_TICK_SECRET` | Shared secret for future `/api/agent/tick` calls |
