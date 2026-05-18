# SignalGen ADK TypeScript agent

This package contains the code-first SignalGen agent skeleton using Google ADK TypeScript.

Official setup reference:

- https://adk.dev/get-started/typescript/#set-your-api-key

## Local setup

```bash
cd agent
cp .env.example .env
# Fill GEMINI_API_KEY and MONGODB_URI locally. Do not commit .env.
npm install
npm run typecheck
npm test
```

## Run with ADK devtools

```bash
npm run dev
```

or:

```bash
npm run web
```

## Current scope

The skeleton can:

1. Read pending SignalGen runs from MongoDB.
2. Classify comments into bugs, feature requests, friction, trust objections, pricing, praise, or noise.
3. Cluster repeated signals.
4. Decide whether to store only, request more evidence, request urgent review, or propose a plan.
5. Persist the analysis back to MongoDB.

Repo-changing actions are intentionally blocked until founder approval workflow and guardrails are implemented.
