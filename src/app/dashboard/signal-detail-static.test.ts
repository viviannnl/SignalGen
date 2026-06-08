import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
const signalPagePath = join(process.cwd(), "src/app/dashboard/signals/[signalId]/page.tsx");
const signalPageSource = existsSync(signalPagePath) ? readFileSync(signalPagePath, "utf8") : "";

describe("dashboard signal detail page navigation source", () => {
  it("routes All Signals rows to the signal-centric detail page instead of run detail", () => {
    expect(dashboardSource).toContain("onOpenSignal");
    expect(dashboardSource).toContain("/dashboard/signals/${signalId}");
    expect(dashboardSource).toContain("View signal detail");
    expect(dashboardSource).not.toContain("View run detail");
    expect(dashboardSource).not.toContain("No linked run");
  });

  it("renders the persisted ProductSignal title and never the embedded run.signal title as the signal page headline", () => {
    expect(signalPageSource).toContain("signal.title");
    expect(signalPageSource).toContain("/api/signals/${signalId}");
    expect(signalPageSource).not.toContain("run.signal.title");
  });

  it("hides lifecycle status badges for noise and praise signals while keeping type badges", () => {
    expect(dashboardSource).toContain('signal.type !== "noise" && signal.type !== "praise"');
    expect(dashboardSource).toContain("<Pill variant={signalTypeVariant(signal.type)}>{formatSignalLabel(signal.type)}</Pill>");
    expect(dashboardSource).toContain("Strength {formatSignalPercent(signal.strength)} · Confidence {formatSignalPercent(signal.confidence)}");
    expect(signalPageSource).toContain('signal.type !== "noise" && signal.type !== "praise"');
    expect(signalPageSource).toContain("<Pill variant={meta.variant}>{meta.label}</Pill>");
  });
});
