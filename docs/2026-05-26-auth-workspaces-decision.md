# SignalGen Auth / Workspaces Decision Record

**Status:** Accepted for Gap B foundation

**Date:** 2026-05-26

**Owner:** SignalGen product/engineering

**Related source of truth:** `docs/signalgen-long-term-plan.md`, Gap B

---

## Decision

Use **Clerk for authentication and organization/workspace identity** as the first production auth provider for SignalGen.

SignalGen will keep its product data in MongoDB and introduce an internal workspace/membership layer that maps Clerk users and Clerk organizations into SignalGen workspace records.

Recommended identity model:

```txt
Clerk user
  → SignalGen user profile
Clerk organization
  → SignalGen workspace
Clerk organization membership/role
  → SignalGen workspace membership/role
SignalGen workspace
  → runs, signals, plans, repo connections, implementation jobs, audit logs
```

GitHub repository writes should still use the existing **GitHub App installation** model, not Clerk. Clerk can provide user identity and optional GitHub OAuth identity later, but repository branch/commit/PR permissions should remain governed by the GitHub App installation and SignalGen's own repo/workspace gates.

---

## Why Clerk

### Best fit for SignalGen's next milestone

Clerk is the best fit because Gap B needs safe multi-user SaaS foundations quickly:

- first-party Next.js SDK support,
- built-in users/sessions,
- built-in organizations that map naturally to SignalGen workspaces,
- hosted sign-in/sign-up UX, reducing custom auth surface area,
- role/member concepts that can seed SignalGen roles (`owner`, `admin`, `member`),
- simpler operational burden than building sessions and org membership manually.

### Current package signal checked

As of 2026-05-26:

- `@clerk/nextjs`: `7.4.1`, “Clerk SDK for NextJS”
- `next-auth`: `4.24.14`, “Authentication for Next.js” / Auth.js homepage
- `@supabase/supabase-js`: `2.106.2`
- `@supabase/ssr`: `0.10.3`

Do not assume these versions remain current; re-check before installing.

---

## Alternatives considered

### Auth.js / NextAuth

**Pros**

- Flexible and open source.
- Good fit when the app wants to own most auth/session persistence.
- Can work with many OAuth providers.

**Cons for SignalGen now**

- Organization/workspace membership must be modeled and secured by SignalGen from scratch.
- More implementation surface area for a founder-stage SaaS.
- Higher risk of auth boundary mistakes while SignalGen is already handling GitHub App repo-write gates.

**Decision:** Keep as fallback if Clerk pricing/lock-in or organization behavior becomes unacceptable.

### Supabase Auth

**Pros**

- Strong fit when app data lives in Supabase/Postgres and can use RLS.
- Good hosted auth and local-development story.

**Cons for SignalGen now**

- SignalGen currently uses MongoDB, so Supabase Auth would not automatically give product-data row-level security.
- Organization/workspace model still requires custom app-layer mapping.
- Introducing Supabase only for auth would add another major platform without replacing MongoDB.

**Decision:** Not preferred unless SignalGen later migrates product data to Supabase/Postgres.

---

## Security requirements for the Clerk integration

1. **Production routes fail closed.** Protected APIs must reject missing/invalid session in production.
2. **Demo fallback is explicit.** Local/demo workspace fallback can only be used when an explicit demo flag is enabled, never silently in production.
3. **Workspace membership is checked before data access.** Every read/write must filter by authorized `workspaceId`.
4. **Repo writes stay separately gated.** Clerk auth does not imply GitHub repo permission. GitHub App installation, selected repo, repo capability, founder approval, and audit logs remain required.
5. **Auditability.** Mutating routes should record the acting user/workspace where applicable.

---

## Implementation phases

### B2 — Central auth/workspace helper

Create a central helper layer, likely:

- `src/lib/auth.ts`
- `src/proxy.ts`
- safe env placeholders in `.env.local.example`

It should expose a small API such as:

```ts
export type AuthContext = {
  userId: string;
  workspaceId: string;
  role: "owner" | "admin" | "member";
  mode: "authenticated" | "demo";
  provider?: "clerk";
};

export async function requireAuthContext(request: Request, options?: { allowDemo?: boolean }): Promise<AuthContext>;
```

Current B2 status: locally implemented. `@clerk/nextjs` is installed, Clerk proxy bootstrap is in place, and `requireAuthContext()` maps a Clerk authenticated user + active organization into SignalGen `userId` + `workspaceId`. Missing sessions and missing active organizations fail closed; demo fallback remains explicit and env-gated. Production Clerk keys still need to be configured outside the repo before protected routes are migrated broadly.

Production/local activation checklist, done outside the repo with real secret values:

1. Create or use a Clerk application for SignalGen.
2. Enable Clerk Organizations so each SignalGen workspace maps to one active Clerk organization.
3. Configure allowed redirect URLs for the deployed app and local development, including `/dashboard`.
4. Set these values in Vercel/local secret stores, never in git:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
5. Keep `SIGNALGEN_ALLOW_DEMO_AUTH` disabled in production unless intentionally running a private demo environment.
6. Smoke-test sign-in, organization creation/selection, `/api/health`, `/dashboard`, and protected product API calls after deployment.

### B3 — Route-by-route enforcement

Move existing routes from `resolveWorkspaceId()` demo behavior to `requireAuthContext()` where production protection is required.

Current B3 status: implemented for product-facing, repo-scoped API routes. The migrated routes now use the shared `getApiAuthContextOrResponse()` wrapper around `requireAuthContext()`, returning `AUTH_REQUIRED`/`WORKSPACE_REQUIRED` JSON before any product-data read/write. Access-boundary tests use non-production trusted auth headers to prove the routes are scoped by the authenticated workspace while preserving repo-selection gates.

Start with read/write APIs already hardened for repo scope:

- `/api/runs`
- `/api/runs/[runId]`
- `/api/runs/[runId]/decision`
- `/api/runs/[runId]/implement`
- `/api/runs/[runId]/implementation`
- `/api/runs/[runId]/implementation/prepare-pr`
- `/api/signals`
- `/api/agent/tick`

### B4/B5 — Data and tests

Add boundary tests proving:

- missing session fails closed when demo mode is disabled,
- demo fallback works only when explicitly enabled,
- workspace A cannot read/write workspace B records,
- background/agent routes process only the selected authorized workspace/repo.

---

## Acceptance criteria for this decision

This B1 decision is complete when:

- source-of-truth plan points to this decision record,
- provider choice is explicit,
- alternatives and tradeoffs are documented,
- security constraints for implementation are documented,
- next implementation phase is B2 central auth/workspace helper.
