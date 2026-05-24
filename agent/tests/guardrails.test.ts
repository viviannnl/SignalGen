import { describe, expect, it } from "vitest";

import { rootAgent } from "../src/agent.js";
import { createProductPr } from "../src/tools/github.js";

describe("repo action guardrails", () => {
  it("blocks PR creation before founder approval", async () => {
    await expect(createProductPr({ runId: "run-1", approved: false })).resolves.toEqual({
      created: false,
      reason: "Founder approval is required before creating a product PR.",
    });
  });

  it("keeps PR automation disabled until product safety gates exist", async () => {
    await expect(createProductPr({ runId: "run-1", approved: true })).resolves.toEqual({
      created: false,
      reason:
        "GitHub PR automation is intentionally disabled until workspace, repository connection, and approval gates are implemented.",
    });
  });
});

function getRootAgentToolNames(): string[] {
  return (rootAgent.tools ?? [])
    .map((tool) => ("name" in tool && typeof tool.name === "string" ? tool.name : undefined))
    .filter((name): name is string => Boolean(name));
}

describe("Stage 1 hosted agent tool surface", () => {
  it("does not include create_product_pr in the active tool list", () => {
    const toolNames = getRootAgentToolNames();
    expect(toolNames).not.toContain("create_product_pr");
  });

  it("includes the analysis and memory tools", () => {
    const toolNames = getRootAgentToolNames();
    expect(toolNames).toContain("process_pending_runs");
    expect(toolNames).toContain("analyze_single_run");
    expect(toolNames).toContain("search_past_signals");
  });
});

