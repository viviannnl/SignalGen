import { FunctionTool, LlmAgent } from "@google/adk";
import { z } from "zod";

import { analyzeRun } from "./tools/signals.js";
import { getRun, listPendingRuns, updateRunWithAnalysis } from "./tools/runs.js";
import { createProductPr } from "./tools/github.js";
import { searchProductMemory } from "./tools/memoryMcp.js";

const processPendingRuns = new FunctionTool({
  name: "process_pending_runs",
  description:
    "Find pending SignalGen feedback runs in MongoDB, use Gemini to classify and cluster comments, decide whether evidence is strong enough, and write the analysis back to MongoDB.",
  parameters: z.object({
    limit: z.number().int().min(1).max(10).default(5).describe("Maximum number of pending runs to process."),
  }),
  async execute({ limit }) {
    const runs = await listPendingRuns(limit);
    const results = [];

    for (const run of runs) {
      const result = await analyzeRun(run);
      const memoryResult = result.signal?.title
        ? await searchProductMemory({ query: result.signal.title, limit: 3 })
        : undefined;
      const updateResult = await updateRunWithAnalysis(result);
      results.push({ ...result, pastSignals: memoryResult?.matches ?? [], memoryWarning: memoryResult?.warning, persisted: updateResult.updated });
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
    "Analyze one SignalGen run by ID using Gemini, cluster available comments, and persist the analysis result.",
  parameters: z.object({
    runId: z.string().describe("MongoDB ObjectId of the SignalGen run to analyze."),
  }),
  async execute({ runId }) {
    const run = await getRun(runId);
    if (!run) return { found: false, runId };

    const result = await analyzeRun(run);
    const updateResult = await updateRunWithAnalysis(result);
    return { found: true, ...result, persisted: updateResult.updated };
  },
});

const createProductPrTool = new FunctionTool({
  name: "create_product_pr",
  description:
    "After founder approval, create a GitHub draft PR in the target product repo with a SIGNALGEN_PLAN.md documenting the planned change. Requires GITHUB_TOKEN, TARGET_REPO_OWNER, TARGET_REPO_NAME env vars.",
  parameters: z.object({
    runId: z.string().describe("MongoDB ObjectId of the approved SignalGen run."),
    approved: z.boolean().describe("Must be true — founder must have approved the plan before calling this."),
  }),
  async execute({ runId, approved }) {
    if (!approved) {
      return { created: false, reason: "Founder approval is required before creating a product PR." };
    }
    const run = await getRun(runId);
    if (!run) return { created: false, reason: `Run ${runId} not found.` };
    if (run.status !== "approved") {
      return { created: false, reason: `Run ${runId} must have status approved before creating a product PR.` };
    }
    return createProductPr({ runId, approved, signal: run.signal, plan: run.plan });
  },
});

const searchPastSignalsTool = new FunctionTool({
  name: "search_past_signals",
  description:
    "Search SignalGen's MongoDB memory for past runs where similar product signals were detected. Useful for checking if a signal has been seen before and what actions were taken.",
  parameters: z.object({
    query: z.string().describe("Keywords to search for in past signal titles and summaries."),
    limit: z.number().int().min(1).max(10).default(5).describe("Max number of matching past signals to return."),
  }),
  async execute({ query, limit }) {
    return searchProductMemory({ query, limit });
  },
});

export const rootAgent = new LlmAgent({
  name: "signalgen_product_iteration_agent",
  model: "gemini-2.5-flash",
  description:
    "SignalGen's AI product-iteration agent. Processes feedback runs with Gemini, detects repeated signals, proposes plans only with strong evidence, and keeps repo actions behind founder approval.",
  instruction: `You are SignalGen, an event-driven product-iteration agent for founders.

Your mission:
1. Process pending feedback runs WITHOUT waiting for the founder to prompt you.
2. Read extracted comments from product/customer/social feedback.
3. Use Gemini to classify and cluster comments into signal groups.
4. Only propose an implementation plan when evidence is strong (2+ bugs, 3+ friction/feature_request).
5. Store weak or noisy signals without acting on them.
6. ALWAYS check search_past_signals before proposing a plan — avoid repeating the same recommendation.
7. Stage 1: PR automation is disabled. Analysis and planning only — no repo writes or PR creation.

When processing feedback:
- Call process_pending_runs to batch-process all pending runs.
- Or call analyze_single_run for a specific run by ID.
- Call search_past_signals to check if this signal pattern was seen before.`,
  tools: [processPendingRuns, analyzeSingleRun, searchPastSignalsTool],
});

export default rootAgent;
