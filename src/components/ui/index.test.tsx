import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SignalGenRunStatus } from "@/lib/types";
import {
  Button,
  Card,
  ConfRing,
  Evidence,
  Field,
  Gauge,
  InfoCard,
  InfoList,
  Input,
  LoopMap,
  MemoryEntry,
  MetricTile,
  Panel,
  Pill,
  PipelineRail,
  PipelineStrip,
  SG_STAGES,
  StatGroup,
  StrengthBar,
  Tab,
  Tabs,
  Textarea,
  stageIndex,
} from "./index";

const source = readFileSync(join(process.cwd(), "src/components/ui/index.tsx"), "utf8");

describe("SignalGen v3 UI primitives", () => {
  it("renders core primitives with v3 class hooks and key states", () => {
    const html = renderToStaticMarkup(
      <div>
        <Button variant="signal" loading>
          Analyze
        </Button>
        <Button variant="rose" size="sm" disabled>
          Legacy rose alias
        </Button>
        <Button variant="secondary" size="lg" block>
          Legacy secondary alias
        </Button>
        <Pill variant="success" dot>
          Approved
        </Pill>
        <Card>Card</Card>
        <Panel>Panel</Panel>
        <Field label="Email" error="Required">
          <Input aria-label="Email" error />
        </Field>
        <Input aria-label="Name" error />
        <Textarea aria-label="Note" error />
      </div>,
    );

    expect(html).toContain("sg-btn--signal");
    expect(html).toContain("aria-busy=\"true\"");
    expect(html).toContain("sg-spin");
    expect(html).toContain("sg-btn--primary");
    expect(html).toContain("sg-btn--ghost");
    expect(html).toContain("sg-btn--block");
    expect(html).toContain("sg-pill--success");
    expect(html).toContain("class=\"dot\"");
    expect(html).toContain("sg-card");
    expect(html).toContain("sg-panel");
    expect(html).toContain("aria-invalid=\"true\"");
    expect(html).toContain("aria-describedby=\"");
    expect(html).toContain("Required");
  });

  it("renders layout/data primitives", () => {
    const html = renderToStaticMarkup(
      <div>
        <Tabs aria-label="Views">
          <Tab selected>Signals</Tab>
          <Tab>Memory</Tab>
        </Tabs>
        <MetricTile label="Confidence" value="93%" />
        <InfoList title="Guardrails" items={["No production writes", "Keep pages unchanged"]} />
        <InfoCard eyebrow="Plan" title="Safe PR" description="Open a draft PR behind approval." />
        <StatGroup stats={[{ label: "runs", value: 12 }, { label: "PRs", value: "4" }]} />
      </div>,
    );

    expect(html).toContain("sg-tabs");
    expect(html).toContain("aria-selected=\"true\"");
    expect(html).toContain("Confidence");
    expect(html).toContain("Guardrails");
    expect(html).toContain("Safe PR");
    expect(html).toContain("runs");
  });

  it("renders Gauge with visible numeral and text label, and keeps ConfRing as a thin alias", () => {
    const gauge = renderToStaticMarkup(<Gauge value={0.93} label="confidence" sub="signal confidence" animate={false} />);
    const ring = renderToStaticMarkup(<ConfRing value={0.5} label="readiness" animate={false} />);

    expect(gauge).toContain("93");
    expect(gauge).toContain("signal confidence");
    expect(gauge).toContain("linearGradient");
    expect(gauge).toContain('role="meter"');
    expect(gauge).toContain('aria-valuenow="93"');
    expect(ring).toContain("50");
    expect(ring).toContain("readiness");
  });

  it("maps real SignalGenRunStatus values to the 9-stage pipeline", () => {
    expect(SG_STAGES).toHaveLength(9);
    expect(SG_STAGES.map((stage) => stage.key)).toEqual([
      "uploaded",
      "extracted",
      "signal_detected",
      "plan_ready",
      "approved",
      "branch_created",
      "checks_running",
      "pr_created",
      "preview_ready",
    ]);

    const expected: Record<SignalGenRunStatus, number> = {
      uploaded: 0,
      signal_detected: 2,
      plan_ready: 3,
      approved: 4,
      rejected: 4,
      failed: 6,
      pr_created: 7,
      needs_review: 4,
      insufficient_evidence: 2,
    };

    for (const [status, stage] of Object.entries(expected) as Array<[SignalGenRunStatus, number]>) {
      expect(stageIndex(status)).toBe(stage);
    }

    expect(stageIndex("extracted")).toBe(1);
    expect(stageIndex("branch_created")).toBe(5);
    expect(stageIndex("checks_running")).toBe(6);
    expect(stageIndex("preview_ready")).toBe(8);
  });

  it("renders pipeline components from real statuses", () => {
    const rail = renderToStaticMarkup(<PipelineRail status="approved" />);
    const strip = renderToStaticMarkup(<PipelineStrip status="pr_created" />);

    expect(rail).toContain("Approval gate");
    expect(strip).toContain("PR");
    expect(strip).toContain("Preview");
    expect(rail).toContain('role="list"');
    expect(rail).toContain('aria-current="step"');
    expect(rail).toContain("current");
    expect(strip).toContain('role="list"');
  });

  it("keeps pipeline strip labels visible and legible by default", () => {
    const strip = renderToStaticMarkup(<PipelineStrip current={3} />);

    for (const label of ["Upload", "Extract", "Signal", "Plan", "Approve", "Branch", "Checks", "PR", "Preview"]) {
      expect(strip).toContain(label);
    }
    expect(strip).toContain("font-size:11px");
    expect(strip).toContain("letter-spacing:.08em");
    expect(strip).toContain("var(--ink-soft)");
  });

  it("renders LoopMap nodes and wires clickable node callbacks in source", () => {
    const html = renderToStaticMarkup(<LoopMap stage={3} signalValue={91} runLabel="run-test" title="Iteration loop" />);

    expect(html).toContain("Feedback");
    expect(html).toContain("Signal");
    expect(html).toContain("Approve");
    expect(html).toContain("Safe PR");
    expect(html).toContain("Memory");
    expect(html).toContain("run-test");
    expect(source).toContain("onNode?.(node.key)");
    expect(source).toContain("const NodeTag = onNode ? \"button\" : \"article\"");
    expect(source).toContain("ResizeObserver");
    expect(source).toContain("transform: `scale(${scale})`");
    expect(source).toContain("var(--connector-strong)");
    expect(source).toContain('opacity: state === "pending" ? 0.86 : 1');
  });

  it("renders Evidence, StrengthBar, and MemoryEntry presentation components", () => {
    const html = renderToStaticMarkup(
      <div>
        <Evidence quote="I got confused during setup." frequency={9} severity="high" confidence={0.91} />
        <StrengthBar value={0.74} label="strength" />
        <MemoryEntry
          title="Users need clearer onboarding"
          type="friction"
          status="plan_ready"
          updatedAt="2026-05-30T18:04:10Z"
          confidence={0.91}
          comments={14}
          clusters={2}
        />
      </div>,
    );

    expect(html).toContain("I got confused during setup.");
    expect(html).toContain("9 mentions");
    expect(html).toContain("91% conf");
    expect(html).toContain("strength");
    expect(html).toContain("Users need clearer onboarding");
    expect(html).toContain("Awaiting approval");
    expect(html).toContain('role="meter"');
    expect(html).toContain("<article");
    expect(html).not.toContain("<button");
  });
});
