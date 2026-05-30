import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");

describe("dashboard signal detail drawer source", () => {
  it("keeps all-signals rows clickable and opens an accessible signal detail drawer", () => {
    expect(dashboardSource).toContain("View details");
    expect(dashboardSource).toContain("setSelectedSignalId");
    expect(dashboardSource).toContain('type="button"');
    expect(dashboardSource).toContain('role="dialog"');
    expect(dashboardSource).toContain("Signal detail");
  });

  it("documents evidence, next-step, and founder decision sections in the drawer", () => {
    expect(dashboardSource).toContain("Evidence");
    expect(dashboardSource).toContain("Recommended next step");
    expect(dashboardSource).toContain("Decision memory");
    expect(dashboardSource).toContain("Evidence references saved");
  });

  it("supports keyboard dismissal with Escape", () => {
    expect(dashboardSource).toContain('event.key === "Escape"');
    expect(dashboardSource).toContain("window.addEventListener");
    expect(dashboardSource).toContain("window.removeEventListener");
  });

  it("lets users select another signal from the open drawer and tolerates missing evidence references", () => {
    expect(dashboardSource).toContain("onSelectSignal");
    expect(dashboardSource).toContain("Other signals");
    expect(dashboardSource).toContain("signal.evidenceItemIds ?? []");
  });
});
