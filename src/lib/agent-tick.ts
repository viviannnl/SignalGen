import { signalGenAdkRuntime, type AgentRuntime } from "./adk-agent-runtime";
import { projectRunClustersToSignalMemory } from "./signal-memory";
import type { ProductSignal, SignalGenRun, SignalGenRunStatus, SignalPlan } from "./types";

const PENDING_STATUSES: SignalGenRunStatus[] = ["uploaded", "signal_detected"];

export type AgentTickStore = {
  listPendingRuns: (limit: number, runId?: string) => Promise<SignalGenRun[]>;
  updateRunAnalysis: (runId: string, update: Partial<SignalGenRun>) => Promise<boolean>;
  listSignals?: (workspaceId?: string) => Promise<ProductSignal[]>;
  listPlans?: (workspaceId?: string) => Promise<SignalPlan[]>;
  persistSignalMemory?: (
    run: SignalGenRun,
    projection: ReturnType<typeof projectRunClustersToSignalMemory>,
  ) => Promise<void>;
};

export type AgentTickResult = {
  ok: true;
  runtime: AgentRuntime["kind"];
  processedCount: number;
  processedRunIds: string[];
};

export async function processAgentTick(
  store: AgentTickStore,
  options: { limit?: number; runId?: string; agentRuntime?: AgentRuntime } = {},
): Promise<AgentTickResult> {
  const limit = options.limit ?? 5;
  const runtime = options.agentRuntime ?? signalGenAdkRuntime;
  const runs = await store.listPendingRuns(limit, options.runId);
  const processedRunIds: string[] = [];

  for (const run of runs) {
    if (!run._id || !PENDING_STATUSES.includes(run.status)) continue;

    let update: Partial<SignalGenRun>;
    try {
      update = await runtime.analyzeRun(run);
    } catch (error) {
      const now = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      update = {
        status: "failed",
        processingError: message,
        updatedAt: now,
        processedAt: now,
      };
    }

    if (store.persistSignalMemory && update.signalClusters) {
      const existingSignals = store.listSignals ? await store.listSignals(run.workspaceId) : [];
      const existingPlans = store.listPlans ? await store.listPlans(run.workspaceId) : [];
      const projection = projectRunClustersToSignalMemory(run._id, update.signalClusters, existingSignals, existingPlans, {
        workspaceId: run.workspaceId,
        now: update.processedAt ?? update.updatedAt,
        sourcePlan: update.plan,
      });
      await store.persistSignalMemory({ ...run, ...update }, projection);
    }

    const updated = await store.updateRunAnalysis(run._id, update);
    if (updated) {
      processedRunIds.push(run._id);
    }
  }

  return {
    ok: true,
    runtime: runtime.kind,
    processedCount: processedRunIds.length,
    processedRunIds,
  };
}
