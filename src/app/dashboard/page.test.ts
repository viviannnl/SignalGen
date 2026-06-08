import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");

describe("dashboard v3 shell", () => {
  it("keeps all existing dashboard API endpoint shapes unchanged", () => {
    expect(source).toContain("fetch(`/api/signals?repoConnectionId=${encodeURIComponent(repoConnectionId)}`, { cache: \"no-store\" })");
    expect(source).toContain("fetch(\"/api/github/connection-status\", { cache: \"no-store\" })");
    expect(source).toContain("fetch(`/api/runs?repoConnectionId=${encodeURIComponent(repoConnectionId)}`, { cache: \"no-store\" })");
    expect(source).toContain("fetch(\"/api/runs\", {");
    expect(source).toContain("fetch(\"/api/agent/tick\", {");
    expect(source).toContain("fetch(`/api/runs/${runId}/decision`, {");
    expect(source).toContain("`/api/runs/${runId}/implement` : `/api/runs/${runId}/implementation/prepare-pr`");
    expect(source).toContain("fetch(`/api/runs/${runId}?repoConnectionId=${encodeURIComponent(repoConnectionId)}`, { cache: \"no-store\" })");
    expect(source).toContain("fetch(\"/api/repo-connections\", {");
    expect(source).toContain("fetch(`/api/repo-connections/${createData.connection._id}/select-repo`, {");
    expect(source).toContain("href=\"/api/github/install\"");
  });

  it("persists dashboard repo and tab state in the URL while keeping localStorage repo fallback", () => {
    expect(source).toContain('type DashboardTab = "new-analysis" | "all-signals" | "github"');
    expect(source).toContain("repoConnectionId");
    expect(source).toContain("new URLSearchParams(window.location.search)");
    expect(source).toContain("signalgen:selectedRepoConnectionId");
    expect(source).toContain("tab=");
    expect(source).toContain("replaceDashboardUrl");
  });

  it("renders the Phase 4a v3 dashboard shell with shared components and honest route boundaries", () => {
    expect(source).toContain("LoopMap");
    expect(source).toContain("PipelineStrip");
    expect(source).toContain("Gauge");
    expect(source).toContain("Tabs");
    expect(source).toContain("Choose a repo first");
    expect(source).toContain("/dashboard/signals/${signalId}");
    expect(source).toContain("/dashboard/memory");
  });

  it("preserves dashboard screenshot upload limits before posting to the existing runs endpoint", () => {
    expect(source).toContain("const MAX_SCREENSHOT_FILES = 5");
    expect(source).toContain("const MAX_SCREENSHOT_FILE_BYTES = 4 * 1024 * 1024");
    expect(source).toContain("const MAX_SCREENSHOT_TOTAL_BYTES = 8 * 1024 * 1024");
    expect(source).toContain('new Set(["image/png", "image/jpeg", "image/webp"])');
    expect(source).toContain("validateDashboardScreenshotFiles");
    expect(source).toContain('formData.append("screenshots", file)');
  });
});
