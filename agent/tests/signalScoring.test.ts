import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeRun, classifyComment, decideCluster } from "../src/tools/signals.js";
import type { SignalGenRun } from "../src/schemas.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SignalGen signal scoring", () => {
  it("classifies obvious feedback categories", () => {
    expect(classifyComment("The checkout is broken and I can't finish")).toBe("bug");
    expect(classifyComment("Can you add Slack integration?")).toBe("feature_request");
    expect(classifyComment("This flow is confusing and hard to understand")).toBe("friction");
    expect(classifyComment("Is this safe or a scam?")).toBe("trust_objection");
    expect(classifyComment("The subscription price is expensive")).toBe("pricing");
    expect(classifyComment("Love this, it is helpful")).toBe("praise");
  });

  it("requires enough repeated evidence before proposing a plan", () => {
    expect(decideCluster("feature_request", 1, "low")).toBe("store_only");
    expect(decideCluster("feature_request", 2, "low")).toBe("needs_more_evidence");
    expect(decideCluster("feature_request", 3, "medium")).toBe("propose_plan");
    expect(decideCluster("bug", 1, "medium")).toBe("urgent_review");
  });

  it("produces plan_ready when a run has repeated actionable comments", async () => {
    const run: SignalGenRun = {
      _id: "local-test-run",
      status: "uploaded",
      extractedComments: [
        "Can you add export support?",
        "I need export support for my team.",
        "Would love an export feature.",
      ],
    };

    vi.stubEnv("GEMINI_API_KEY", "");

    const result = await analyzeRun(run);

    expect(result.status).toBe("plan_ready");
    expect(result.signalClusters?.[0]?.decision).toBe("propose_plan");
    expect(result.plan?.acceptanceCriteria?.length).toBeGreaterThan(0);
  });

  it("preserves evidence text when extracted comments have custom ids", async () => {
    const run: SignalGenRun = {
      _id: "custom-id-run",
      status: "uploaded",
      extractedComments: [
        { id: "source-a", text: "Can you add export support?" },
        { id: "source-b", text: "I need export support for my team." },
        { id: "source-c", text: "Would love an export feature." },
      ],
    };

    vi.stubEnv("GEMINI_API_KEY", "");

    const result = await analyzeRun(run);

    expect(result.status).toBe("plan_ready");
    expect(result.signal?.evidence).toEqual([
      "Can you add export support?",
      "I need export support for my team.",
      "Would love an export feature.",
    ]);
  });
});
