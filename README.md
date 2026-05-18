# SignalGen

**SignalGen** is an AI product-iteration agent for founders.

It turns customer feedback screenshots into safe, reviewable product PRs.

> From customer signal to product PR.

## Hackathon

Built for the **Google Cloud Rapid Agent Hackathon**.

## Product workflow

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

## Initial target product

SignalGen will use **LetterGen** as the first demo target repo:

- Production: https://www.lettergen.io
- GitHub: https://github.com/viviannnl/ai-cover-letter

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
TARGET_REPO=viviannnl/ai-cover-letter
```
