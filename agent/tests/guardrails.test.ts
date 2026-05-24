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

  it("requires GITHUB_TOKEN, TARGET_REPO_OWNER, and TARGET_REPO_NAME to be set", async () => {
    const saved = {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      TARGET_REPO_OWNER: process.env.TARGET_REPO_OWNER,
      TARGET_REPO_NAME: process.env.TARGET_REPO_NAME,
    };
    delete process.env.GITHUB_TOKEN;
    delete process.env.TARGET_REPO_OWNER;
    delete process.env.TARGET_REPO_NAME;

    try {
      const result = await createProductPr({
        runId: "run-1",
        approved: true,
        plan: {
          recommendedChange: "Add dark mode",
          filesToChange: ["src/styles/theme.css"],
          guardrails: ["No breaking changes"],
          acceptanceCriteria: ["Toggle works on all pages"],
        },
      });
      expect(result.created).toBe(false);
      expect((result as { reason: string }).reason).toContain("GITHUB_TOKEN");
    } finally {
      if (saved.GITHUB_TOKEN !== undefined) process.env.GITHUB_TOKEN = saved.GITHUB_TOKEN;
      if (saved.TARGET_REPO_OWNER !== undefined) process.env.TARGET_REPO_OWNER = saved.TARGET_REPO_OWNER;
      if (saved.TARGET_REPO_NAME !== undefined) process.env.TARGET_REPO_NAME = saved.TARGET_REPO_NAME;
    }
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

