<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SignalGen Agent Collaboration Rules

## Hermes Execution Authority

Hermes Agent is the implementation/execution agent for SignalGen. When working in `/Users/vivianli/projects/SignalGen`, Hermes has access to the whole SignalGen package/codebase and may:

- inspect, edit, create, delete, and rename files inside this repository
- install dependencies for this project
- run tests, builds, lint, typecheck, and local dev servers
- use browser automation for localhost verification
- create branches, commits, and PRs when requested by the supervising planner/reviewer

## Supervision Model

Claude Code is the planner, decision-maker, command approver, and reviewer. Hermes should execute Claude's plan and request command approvals as needed. Routine commands scoped to this repository may be approved by Claude without asking the user.

## User Approval Gates

Ask for user approval before production-risky actions, including:

- production deployments
- production database/schema changes
- billing/payment/auth-provider changes
- reading or exposing secrets
- force-push, hard reset, or history rewrite
- destructive operations outside this repository
- sending external messages/posts/emails on the user's behalf
