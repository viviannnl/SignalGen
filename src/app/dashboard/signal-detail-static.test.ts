import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
const runDetailSource = readFileSync(join(process.cwd(), "src/app/dashboard/runs/[runId]/page.tsx"), "utf8");

describe("dashboard signal run-detail navigation source", () => {
  it("keeps all-signals rows clickable and opens the full run detail page", () => {
    expect(dashboardSource).toContain("<SignalRow key={signal._id} signal={signal} onOpenRun={onOpenRun} />");
    expect(dashboardSource).toContain('type="button"');
    expect(dashboardSource).toContain("onClick={runId ? () => onOpenRun(runId) : undefined}");
    expect(dashboardSource).toContain(
      "router.push(`/dashboard/runs/${runId}?repoConnectionId=${encodeURIComponent(selectedRepoConnectionId)}&tab=all-signals`)",
    );
    expect(dashboardSource).toContain('hasRun ? "View run detail" : "No linked run"');
  });

  it("preserves row accessibility and tolerates missing linked runs or evidence references", () => {
    expect(dashboardSource).toContain("const evidenceItemIds = signal.evidenceItemIds ?? [];");
    expect(dashboardSource).toContain("const hasRun = Boolean(runId);");
    expect(dashboardSource).toContain("disabled={!hasRun}");
    expect(dashboardSource).toContain("aria-disabled={!hasRun}");
    expect(dashboardSource).toContain("cursor: hasRun ? \"pointer\" : \"default\"");
  });

  it("moves detail content into the run detail page instead of the removed drawer", () => {
    expect(runDetailSource).toContain("useParams<{ runId: string }>");
    expect(runDetailSource).toContain("const repoConnectionId = urlParams.get(\"repoConnectionId\") ?? \"\";");
    expect(runDetailSource).toContain("returnTab = urlParams.get(\"tab\") ?? \"all-signals\"");
    expect(runDetailSource).toContain("Back to signals");
    expect(runDetailSource).toContain("Evidence · tuned from {commentCount} comments");
    expect(runDetailSource).toContain("Implementation plan");
    expect(runDetailSource).toContain("Recommended change");
    expect(runDetailSource).toContain("<ApprovalGate");
  });

  it("does not keep the removed signal-detail drawer plumbing", () => {
    expect(dashboardSource).not.toContain("setSelectedSignalId");
    expect(dashboardSource).not.toContain('role="dialog"');
    expect(dashboardSource).not.toContain('event.key === "Escape"');
    expect(dashboardSource).not.toContain("onSelectSignal");
    expect(dashboardSource).not.toContain("Other signals");
  });
});
