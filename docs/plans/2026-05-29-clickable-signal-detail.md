# Clickable Signal Detail Implementation Plan

> **For Hermes/Claude:** Use the Claude-Hermes supervisor loop. Claude supervises, delegates implementation to Hermes through MCP, reviews each milestone, and keeps one final PR/commit series rather than per-milestone PRs unless Vivian asks otherwise.

**Goal:** Make each row in the dashboard “All signals” list clickable so the user can inspect a detail view for that specific signal.

**Architecture:** Start with a right-side detail drawer on `/dashboard` instead of a separate full page. The dashboard already loads `signals` from `/api/signals`, and those records include summary fields, evidence item IDs, optional `evidenceItems`, status, confidence, strength, and optional `currentPlan`. The drawer should be controlled by client state, stay in the current All signals flow, and expose enough evidence-backed context that a signal feels like a product insight rather than a static row.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Vitest.

---

## User-visible behavior

When a user is on `/dashboard`, has selected a connected repo, and opens the **All signals** tab:

1. Each signal row/card is visually and semantically clickable.
2. Clicking a signal opens a right-side drawer/panel for that signal without leaving the dashboard.
3. The drawer shows:
   - signal title and summary
   - signal type/category and status
   - evidence count
   - strength and confidence
   - created/updated timestamps
   - evidence items, including evidence title, summary, frequency, severity, confidence, decision, and source run ID when available
   - recommended next step/current plan if available
   - plan guardrails/files/acceptance criteria if available
   - founder approval/rejection decision if available
4. The drawer can be closed with a visible close button and the Escape key.
5. Selecting a different signal while the drawer is open replaces the drawer content.
6. Empty/missing data has graceful fallback copy; no `undefined`, broken dates, or runtime errors.
7. Keyboard users can focus a signal row and open it with Enter/Space.
8. The dashboard remains usable on mobile; the drawer becomes a full-width overlay or stacked panel as appropriate.

## Success criteria

### Functional acceptance criteria

- [ ] `All signals` rows are implemented as accessible buttons or equivalent keyboard-operable controls.
- [ ] Opening a signal detail does not navigate away from `/dashboard` and does not require re-fetching the whole dashboard.
- [ ] The detail drawer renders signal summary, metadata, evidence, plan, and founder decision sections from the existing `ApiSignal` object.
- [ ] Close behavior works by button, backdrop if implemented, and Escape.
- [ ] If `signal.evidenceItems` is empty but `signal.evidenceItemIds` exists, the drawer still explains that saved evidence references exist but detailed evidence text is not available yet.
- [ ] Fallback legacy-run signals from `/api/signals` still render and open; no assumption that every signal has a Mongo `signals` document ID beyond the existing `_id` used by the list key.
- [ ] Existing dashboard flows still work: New analysis, repo connection selection, run cards, and GitHub tab are not regressed.

### Design criteria

- [ ] Styling uses the existing SignalGen dark glass/cyan design system in `src/app/dashboard/page.tsx`; do not import a new visual style.
- [ ] Rows communicate clickability with hover/focus states and a small “View details” affordance.
- [ ] Drawer emphasizes the product concept: an evidence-backed product signal/memory, not “MongoDB memory” or technical storage wording.
- [ ] Copy uses generic product wording; avoid hard-coded LetterGen/Xiaohongshu references.

### Test criteria

- [ ] Add or update a Vitest test where practical for helper logic or extracted components.
- [ ] If the UI remains in one large client component and component testing is not configured, add at least a static regression test that reads `src/app/dashboard/page.tsx` and asserts the detail drawer, keyboard/escape handling, and user-facing labels exist.
- [ ] Run `npm test` or the targeted Vitest test first, then full `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.

### Manual verification criteria

- [ ] Start local dev server with `npm run dev`.
- [ ] Open `/dashboard` in a browser.
- [ ] Confirm dashboard renders without new console errors.
- [ ] If auth/data blocks the real All signals path, verify signed-out/auth-boundary behavior and use local/static tests for the drawer; clearly document what could not be fully clicked through.
- [ ] If seeded/test data is available, select a repo, open All signals, click a signal, inspect drawer content, close with button and Escape, then open another signal.

## Non-goals

- Do not build a separate `/signals/[id]` page in this milestone unless the existing code strongly favors it after inspection.
- Do not add production database migrations.
- Do not change signal extraction/clustering logic.
- Do not add repo-writing/PR automation or new external write capabilities.
- Do not deploy to production without Vivian’s explicit approval.

## Safety gates

Pause and ask Vivian before:

- production deploys
- production database/schema changes
- auth/provider/billing changes
- reading or exposing secrets
- force-push/history rewrite
- destructive actions outside `/Users/vivianli/projects/SignalGen`
- external side effects beyond GitHub branch/PR operations explicitly requested

## Suggested implementation tasks

### Task 1: Inspect dashboard and data shape

**Objective:** Confirm the current signal data shape and where to add UI state.

**Files:**
- Read: `src/app/dashboard/page.tsx`
- Read: `src/app/api/signals/route.ts`
- Read: `src/lib/types.ts`
- Read tests near: `src/app/api/signals/route.test.ts`, existing static/UI tests if any

**Steps:**
1. Check branch/status and create a feature branch if appropriate, e.g. `feat/clickable-signal-detail`.
2. Locate `ApiSignal`, `signals.map`, and current All signals markup.
3. Decide whether to keep drawer inline in `page.tsx` or extract small helper components inside the same file.
4. Record any existing lint/build constraints.

### Task 2: Add regression test before implementation

**Objective:** Create a test that fails before the drawer exists and passes after implementation.

**Files:**
- Create/modify: a relevant Vitest test, likely `src/app/dashboard/page.test.ts` or `src/app/dashboard/signal-detail-static.test.ts` depending on current test conventions.

**Test expectations:**
- Dashboard source includes a signal detail drawer component/section.
- It includes labels such as `Signal detail`, `Evidence`, `Recommended next step`, and `View details`.
- It includes Escape-key close handling or an explicit close handler testable via source/static checks.
- It includes keyboard activation via button semantics or key handling.

**Verification:**
- Run targeted test and confirm it fails for the expected reason before implementation.

### Task 3: Implement clickable signal rows

**Objective:** Make All signals rows accessible interactive controls.

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Implementation guidance:**
- Add `const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);` or `const [selectedSignal, setSelectedSignal] = useState<ApiSignal | null>(null);`.
- Prefer deriving selected signal from `signals` by `_id` so refreshed signal data updates drawer content.
- Convert row wrapper to a `<button type="button">` or an article with an inner button. Prefer button for keyboard semantics.
- Preserve the grid layout and add hover/focus classes.
- Include an affordance like `View details →`.

**Verification:**
- TypeScript compile/build should not complain about nested interactive elements or invalid JSX.

### Task 4: Implement signal detail drawer

**Objective:** Render the selected signal’s evidence-backed details.

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Content sections:**
- Header: `Signal detail`, title, close button.
- Summary: title, summary.
- Metadata chips: type, status, strength, confidence, evidence count, created/updated.
- Evidence: map `signal.evidenceItems`; if missing, fallback to `signal.evidenceItemIds` count and IDs where useful.
- Recommended next step: `signal.currentPlan?.recommendedChange` or fallback copy.
- Plan details: files to change, acceptance criteria, guardrails.
- Founder decision: approval/rejection and timestamp/reason if available.

**UX guidance:**
- Use fixed overlay on desktop and mobile-safe full-width panel on small screens.
- Add `aria-label`/`aria-labelledby` and `role="dialog"` or equivalent.
- Close on Escape via `useEffect` only while selected signal is non-null.
- Keep copy founder-friendly: “Evidence”, “Recommended next step”, “Decision memory”.

### Task 5: Verify and polish

**Objective:** Validate the change and fix issues found by tests/build/manual testing.

**Commands:**
- `npm test -- src/app/dashboard/<test-file>` if targeted test exists
- `npm test`
- `npm run lint`
- `npm run build`

**Manual:**
- `npm run dev`
- Browser-check `/dashboard` and console.
- If signed-in data is available, click through All signals and drawer behavior.

### Task 6: Review, commit, and prepare one final PR if requested

**Objective:** Keep the change safe and reviewable.

**Steps:**
1. `git diff` and `git status --short`.
2. Check that only intended files changed.
3. Secret/debug-log scan.
4. Independent review pass.
5. Commit with a message like `feat: add signal detail drawer` after verification passes.
6. Push/create PR only if requested or if Claude supervisor determines this is part of the active branch workflow and no production-risk action is involved.

## Final report format

Claude/Hermes should report back with:

- What was built
- Exact files changed
- Tests/lint/build results
- Manual localhost/browser verification result
- Commit SHA/branch/PR if created
- Any caveats, especially if auth/data prevented full click-through testing
