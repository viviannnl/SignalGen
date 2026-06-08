import type { ProductSignal, SignalGenRun, SignalPlan } from "./types";

export type SignalWithPlan = ProductSignal & {
  currentPlan?: SignalPlan;
};

export type RelatedRun = Pick<SignalGenRun, "_id" | "status" | "founderDecision" | "updatedAt" | "signal" | "implementation" | "pr" | "plan">;

export function getEvidenceRunIds(signal: Pick<ProductSignal, "runId" | "evidenceItems">): string[] {
  const runIds = [signal.runId, ...(signal.evidenceItems?.map((item) => item.runId) ?? [])].filter((id): id is string => Boolean(id));
  return Array.from(new Set(runIds));
}

function normalizeTitle(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function rankByPrimaryTitle(signal: SignalWithPlan, runs: RelatedRun[]) {
  const signalTitle = normalizeTitle(signal.title);
  if (!signalTitle) return runs;
  return [...runs].sort((left, right) => {
    const leftMatches = normalizeTitle(left.signal?.title) === signalTitle ? 1 : 0;
    const rightMatches = normalizeTitle(right.signal?.title) === signalTitle ? 1 : 0;
    return rightMatches - leftMatches;
  });
}

export function chooseSignalRunId(signal: SignalWithPlan, relatedRunsById: Map<string, RelatedRun>): string | undefined {
  const runIds = getEvidenceRunIds(signal);
  const relatedRuns = rankByPrimaryTitle(
    signal,
    runIds.map((runId) => relatedRunsById.get(runId)).filter((run): run is RelatedRun => Boolean(run)),
  );
  const decisionAction = signal.currentPlan?.approvalDecision?.action;

  const findRun = (predicate: (run: RelatedRun) => boolean) => relatedRuns.find(predicate);
  const hasDecisionAction = (run: RelatedRun, action: "approve" | "reject") => !decisionAction || run.founderDecision?.action === action || !run.founderDecision;

  const preferredRun = (() => {
    if (signal.status === "approved") {
      return findRun((run) => ["pr_created", "implemented", "approved"].includes(run.status) && hasDecisionAction(run, "approve"));
    }
    if (signal.status === "rejected") return findRun((run) => run.status === "rejected" && hasDecisionAction(run, "reject"));
    if (signal.status === "implemented") return findRun((run) => run.status === "pr_created") ?? findRun((run) => run.status === "approved");
    if (signal.status === "plan_ready") return findRun((run) => run.status === "plan_ready");
    return undefined;
  })();

  if (preferredRun?._id) return preferredRun._id;

  if (["approved", "rejected", "implemented", "plan_ready"].includes(signal.status)) {
    // Decided/plan-ready signal rows are safer without navigation than linking to a run whose detail page shows the opposite state.
    return undefined;
  }

  return runIds[0];
}

export function chooseSignalRun(signal: SignalWithPlan, relatedRunsById: Map<string, RelatedRun>): RelatedRun | undefined {
  const runId = chooseSignalRunId(signal, relatedRunsById);
  return runId ? relatedRunsById.get(runId) : undefined;
}
