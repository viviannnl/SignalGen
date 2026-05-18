import { describe, expect, it } from "vitest";

import { createProductPr } from "../src/tools/github.js";

describe("repo action guardrails", () => {
  it("blocks PR creation before founder approval", async () => {
    await expect(createProductPr({ runId: "run-1", approved: false })).resolves.toEqual({
      created: false,
      reason: "Founder approval is required before creating a product PR.",
    });
  });

  it("keeps PR automation disabled in the skeleton even after approval", async () => {
    const result = await createProductPr({ runId: "run-1", approved: true });

    expect(result.created).toBe(false);
    expect(result.reason).toContain("disabled");
  });
});
