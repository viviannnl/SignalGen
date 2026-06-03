import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const detailSource = readFileSync(join(process.cwd(), "src/app/dashboard/runs/[runId]/page.tsx"), "utf8");

describe("run detail approval gate source", () => {
  it("uses the v3 shared signal-room primitives", () => {
    expect(detailSource).toContain("PipelineRail");
    expect(detailSource).toContain("Gauge");
    expect(detailSource).toContain("StrengthBar");
    expect(detailSource).toContain("Evidence");
    expect(detailSource).toContain("InfoList");
  });

  it("preserves the existing run, decision, implement, and prepare-pr endpoints", () => {
    expect(detailSource).toContain("/api/runs/${runId}");
    expect(detailSource).toContain("/api/runs/${runId}/decision");
    expect(detailSource).toContain("/api/runs/${runId}/implement");
    expect(detailSource).toContain("/api/runs/${runId}/implementation/prepare-pr");
    expect(detailSource).toContain("repoConnectionId");
  });

  it("ships only approve and reject founder-decision actions", () => {
    expect(detailSource).toContain('postDecision("approve"');
    expect(detailSource).toContain('postDecision("reject"');
    expect(detailSource).not.toContain(">Request changes<");
    expect(detailSource).not.toContain(">Save for later<");
    expect(detailSource).not.toContain('action: "changes"');
    expect(detailSource).not.toContain('action: "saved"');
  });

  it("requires a rejection note before confirmation and gates PR/preview links on real URLs", () => {
    expect(detailSource).toContain("rejectNote.trim()");
    expect(detailSource).toContain("disabled={rejectNote.trim().length === 0");
    expect(detailSource).toContain("prUrl");
    expect(detailSource).toContain("previewUrl");
    expect(detailSource).toContain("View PR");
    expect(detailSource).toContain("Open Vercel preview");
  });

  it("documents the intentional prototype fidelity deviation for unsupported gate controls", () => {
    expect(detailSource).toContain("Fidelity note");
    expect(detailSource).toContain("Request changes");
    expect(detailSource).toContain("Save for later");
    expect(detailSource).toContain("founder-decision API supports only approve/reject");
  });
});
