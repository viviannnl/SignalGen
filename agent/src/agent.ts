import { FunctionTool, LlmAgent } from "@google/adk";
import { z } from "zod";

import { analyzeRun } from "./tools/signals.js";
import { getRun, listPendingRuns, updateRunWithAnalysis } from "./tools/runs.js";

const processPendingRuns = new FunctionTool({
  name: "process_pending_runs",
  description:
    "Find pending SignalGen feedback runs in MongoDB, classify and cluster comments, decide whether evidence is strong enough, and write the analysis back to MongoDB.",
  parameters: z.object({
    limit: z.number().int().min(1).max(10).default(5).describe("Maximum number of pending runs to process."),
  }),
  async execute({ limit }) {
    const runs = await listPendingRuns(limit);
    const results = [];

    for (const run of runs) {
      const result = analyzeRun(run);
      const updateResult = await updateRunWithAnalysis(result);
      results.push({ ...result, persisted: updateResult.updated });
    }

    return {
      processedCount: results.length,
      results,
    };
  },
});

const analyzeSingleRun = new FunctionTool({
  name: "analyze_single_run",
  description:
    "Analyze one SignalGen run by ID, classify and cluster available comments, and persist the analysis result.",
  parameters: z.object({
    runId: z.string().describe("MongoDB ObjectId of the SignalGen run to analyze."),
  }),
  async execute({ runId }) {
    const run = await getRun(runId);
    if (!run) return { found: false, runId };

    const result = analyzeRun(run);
    const updateResult = await updateRunWithAnalysis(result);
    return { found: true, ...result, persisted: updateResult.updated };
  },
});

export const rootAgent = new LlmAgent({
  name: "signalgen_product_iteration_agent",
  model: "gemini-flash-latest",
  description:
    "SignalGen's code-first product-iteration agent. It processes feedback runs, detects repeated signals, proposes action only when evidence is strong, and keeps risky code actions behind founder approval.",
  instruction: `You are SignalGen, an event-driven product-iteration agent.

Your mission:
1. Inspect pending feedback runs without requiring the founder to write an analysis prompt.
2. Read extracted comments from product/customer/social feedback.
3. Classify comments as bug, feature_request, friction, trust_objection, pricing, praise, or noise.
4. Cluster repeated signals and decide whether there is enough evidence to act.
5. Store weak/noisy signals as memory only.
6. Propose implementation plans only when evidence is strong enough.
7. Never create or suggest direct production changes. Founder approval is required before any repo-changing action.
8. Keep product changes small, reviewable, and PR-based.

When asked to process feedback, call process_pending_runs or analyze_single_run.`,
  tools: [processPendingRuns, analyzeSingleRun],
});

export default rootAgent;
