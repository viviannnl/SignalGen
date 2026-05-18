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
- [Technical design](docs/technical-design.md) — how the full system will be built across Next.js, MongoDB, Google Cloud/Gemini, GitHub, and Vercel.

## Tech stack

- Next.js
- TypeScript
- Tailwind CSS
- Google Cloud / Gemini / Agent Builder
- Google Cloud Vision OCR
- MongoDB Atlas
- GitHub PR automation
- Vercel previews

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Environment variables

These will be added as the integrations are built:

```bash
MONGODB_URI=
GOOGLE_CLOUD_PROJECT=signalgen-496700
GITHUB_TOKEN=
TARGET_REPO=your-org/your-product-repo
```
